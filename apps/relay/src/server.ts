import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Buffer } from "node:buffer";
import WebSocket, { WebSocketServer, type RawData } from "ws";
import type { AuditSink } from "@winbridge/audit-log";
import { createRelayAuditSink, writeRelayAudit } from "./audit.js";
import {
  createRelayHeartbeatConfig,
  createRelayHeartbeatState,
  isHeartbeatTimedOut,
  markHeartbeatPing,
  markHeartbeatPong,
  normalizeRelayHeartbeatConfig,
  type RelayHeartbeatConfig,
  type RelayHeartbeatSetting
} from "./heartbeat.js";
import { createDevelopmentRateLimiter, SlidingWindowRateLimiter, type RateLimitDecision } from "./rate-limit.js";
import {
  createMessageBase,
  decodeProtocolEnvelope,
  encodeProtocolEnvelope,
  hasSecretBearingProtocolIdentifierMetadata,
  JoinSessionMessageSchema,
  SELF_PAIRING_DEVICE_REJECTION_REASON,
  stringifyJson,
  type AuditDetail,
  type DeviceIdentity,
  type ProtocolEnvelope
} from "@winbridge/protocol";
import {
  DEFAULT_RELAY_PAIRING_TICKET_MAX_USES,
  DEFAULT_RELAY_PAIRING_TICKET_TTL_MS,
  MAX_RELAY_PAIRING_TICKET_MAX_USES,
  MAX_RELAY_PAIRING_TICKET_TTL_MS,
  DUPLICATE_RELAY_PEER_JOIN_REASON,
  SAME_ROLE_RELAY_PEER_JOIN_REASON,
  normalizeRelayPairingConfig,
  RoomRegistry,
  type RelayJoinResult,
  type RelayPairingConfig,
  type RelayPeer
} from "./rooms.js";

const MAX_RELAY_MESSAGE_BYTES = 64 * 1024;
export const MAX_RELAY_SHARED_TOKEN_BYTES = 1024;
const RELAY_MESSAGE_TOO_LARGE_REASON = `Relay message exceeds ${MAX_RELAY_MESSAGE_BYTES} bytes`;
const GENERIC_RELAY_REJECTION_REASON = "Invalid relay message";
const RELAY_TOKEN_NOT_CONFIGURED_CLOSE_REASON = "Relay token is not configured";
const ORPHANED_VIEWER_CLOSE_REASON = "Host disconnected";
const STALE_REGISTERED_PEER_REASON = "Registered peer is no longer in room";
const RELAY_RUNTIME_ALREADY_STARTED_ERROR_MESSAGE = "Relay runtime is already started";
const RELAY_SHARED_TOKEN_ERROR_MESSAGE =
  "WINBRIDGE_RELAY_SHARED_TOKEN must be non-blank, already trimmed, 1024 UTF-8 bytes or less, contain no ASCII control characters, and contain no Unicode bidi or zero-width formatting controls";
const SAFE_RELAY_REJECTION_REASONS = new Set([
  GENERIC_RELAY_REJECTION_REASON,
  RELAY_MESSAGE_TOO_LARGE_REASON,
  "Host pairing ticket required",
  "Pairing code mismatch",
  "Pairing ticket is expired",
  "Pairing ticket has no remaining uses",
  SELF_PAIRING_DEVICE_REJECTION_REASON,
  DUPLICATE_RELAY_PEER_JOIN_REASON,
  SAME_ROLE_RELAY_PEER_JOIN_REASON,
  "Registered peers cannot send join-session messages",
  "Relay-ready messages are relay-originated",
  "Message session does not match registered peer",
  "Message peer identity does not match registered peer",
  "Message role does not match registered peer",
  "No recipient peer is registered",
  "Message target does not match registered recipient",
  STALE_REGISTERED_PEER_REASON,
  "Peer disconnect notices are relay-originated",
  "Signal payload must not be empty",
  "Signal payload must be 16384 bytes or less",
  "Signal payload must not contain sensitive remote-assistance data"
]);

export type RelayRuntimeOptions = {
  port?: number;
  sharedToken?: string;
  rooms?: RoomRegistry;
  auditSink?: AuditSink;
  heartbeat?: RelayHeartbeatSetting;
  pairing?: Partial<RelayPairingConfig>;
  invalidTokenLimiter?: SlidingWindowRateLimiter;
  invalidMessageLimiter?: SlidingWindowRateLimiter;
  logger?: {
    log(message: string): void;
    warn(message: string): void;
  };
};

export type RelayRuntime = {
  start(): Promise<void>;
  stop(): Promise<void>;
  url(): string;
};

type RelayJoinAuditDeviceIdentity = Pick<
  DeviceIdentity,
  "createdAt" | "platform" | "trustLevel"
> & {
  deviceId?: string;
  deviceIdRedacted?: boolean;
  deviceIdLength?: number;
};
type RelayDeniedJoinAuditDeviceIdentity = RelayJoinAuditDeviceIdentity;
type RelayAuditDeviceIdentityOptions = {
  redactDeviceId?: boolean;
};
type JoinDenialAuditAttributionOptions = {
  redactAttemptedDeviceId?: boolean;
};
type RelayRuntimeStartState = "idle" | "starting" | "started";

export function createRelayRuntime(options: RelayRuntimeOptions = {}): RelayRuntime {
  const port = normalizeRelayPort(options.port === undefined ? 8787 : options.port);
  const sharedToken = normalizeRelaySharedToken(options.sharedToken);
  const pairingConfig = normalizeRelayPairingConfig({
    ...createRelayPairingConfig(),
    ...options.pairing
  });
  const rooms = options.rooms ?? new RoomRegistry(pairingConfig);
  const auditSink = options.auditSink ?? createRelayAuditSink();
  const heartbeat =
    options.heartbeat === undefined
      ? createRelayHeartbeatConfig()
      : options.heartbeat === false
        ? false
        : normalizeRelayHeartbeatConfig(options.heartbeat);
  const invalidTokenLimiter =
    options.invalidTokenLimiter ??
    createDevelopmentRateLimiter(process.env, "WINBRIDGE_RELAY_INVALID_TOKEN");
  const invalidMessageLimiter =
    options.invalidMessageLimiter ??
    createDevelopmentRateLimiter(process.env, "WINBRIDGE_RELAY_INVALID_MESSAGE");
  const logger = options.logger ?? console;
  const server = createServer();
  const wss = new WebSocketServer({ server, maxPayload: MAX_RELAY_MESSAGE_BYTES });
  let startState: RelayRuntimeStartState = "idle";

  wss.on("connection", (socket, request) => {
    const requestUrl = new URL(request.url ?? "/", "ws://localhost");
    const token = readSingleRelayToken(requestUrl);
    const remoteKey = request.socket.remoteAddress ?? "unknown-remote";

    if (!sharedToken && token.presented) {
      const decision = invalidTokenLimiter.consume(remoteKey);
      writeRelayAudit(auditSink, {
        action: "relay.token.denied",
        outcome: "denied",
        detail: {
          accessPresented: true,
          accessConfigured: false,
          rateLimit: rateLimitAuditDetail(decision)
        }
      });
      socket.close(
        1008,
        decision.allowed ? RELAY_TOKEN_NOT_CONFIGURED_CLOSE_REASON : "Relay token rate limit exceeded"
      );
      return;
    }

    if (sharedToken && token.value !== sharedToken) {
      const decision = invalidTokenLimiter.consume(remoteKey);
      writeRelayAudit(auditSink, {
        action: "relay.token.denied",
        outcome: "denied",
        detail: {
          accessPresented: token.presented,
          accessConfigured: true,
          rateLimit: rateLimitAuditDetail(decision)
        }
      });
      socket.close(1008, decision.allowed ? "Invalid relay token" : "Relay token rate limit exceeded");
      return;
    }

    let registeredPeer: RelayPeer | undefined;
    let disconnectReasonCode: Extract<ProtocolEnvelope, { type: "peer-disconnected" }>["reasonCode"] =
      "peer-closed";
    const stopHeartbeat = heartbeat
      ? startPeerHeartbeat({
          auditSink,
          config: heartbeat,
          getPeer: () => registeredPeer,
          onTimeout: () => {
            disconnectReasonCode = "heartbeat-timeout";
          },
          socket
        })
      : () => undefined;

    socket.on("message", (data) => {
      try {
        const messageBytes = rawDataByteLength(data);
        if (messageBytes > MAX_RELAY_MESSAGE_BYTES) {
          throw new Error(RELAY_MESSAGE_TOO_LARGE_REASON);
        }

        const envelope = decodeProtocolEnvelope(rawDataToString(data));

        if (!registeredPeer) {
          let joinResult: RelayJoinResult | undefined;
          let joinDeviceIdentity: RelayJoinAuditDeviceIdentity | undefined;
          try {
            const registeredJoin = registerFirstMessage(
              rooms,
              envelope,
              (payload) => {
                if (socket.readyState !== WebSocket.OPEN) {
                  return false;
                }

                socket.send(payload);
                return true;
              },
              (code, reason) => {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.close(code, reason);
                }
              }
            );
            registeredPeer = registeredJoin.peer;
            joinResult = registeredJoin.result;
            joinDeviceIdentity = registeredJoin.deviceIdentity;
          } catch (error) {
            const reason = safeRelayRejectionReason(error);
            const attribution = joinDenialAuditAttribution(
              envelope,
              reason === SELF_PAIRING_DEVICE_REJECTION_REASON
                ? { redactAttemptedDeviceId: true }
                : undefined
            );
            writeRelayAudit(auditSink, {
              action: "relay.peer.join.denied",
              outcome: "denied",
              sessionId: attribution.sessionId,
              peerId: attribution.peerId,
              reason,
              detail: {
                messageType: envelope.type,
                pairing: pairingDeniedAuditDetail(reason),
                ...attribution.detail
              }
            });
            throw error;
          }

          if (!joinResult) {
            throw new Error("Peer join result missing");
          }

          const ready = encodeProtocolEnvelope({
            ...createMessageBase(registeredPeer.sessionId),
            type: "relay-ready",
            peerId: registeredPeer.peerId,
            roomSize: rooms.size(registeredPeer.sessionId)
          });
          socket.send(ready);
          const joinAuditDetail: AuditDetail = {
            role: registeredPeer.role,
            roomSize: rooms.size(registeredPeer.sessionId),
            pairingTicketCreated: joinResult.ticketCreated,
            pairingTicketConsumed: joinResult.ticketConsumed,
            pairedDeviceRecorded: Boolean(joinResult.pairedDevice)
          };
          if (joinResult.ticketRemainingUses !== undefined) {
            joinAuditDetail.pairingTicketRemainingUses = joinResult.ticketRemainingUses;
          }
          if (joinDeviceIdentity) {
            joinAuditDetail.deviceIdentity = joinDeviceIdentity;
          }
          writeRelayAudit(auditSink, {
            action: "relay.peer.join.accepted",
            outcome: "accepted",
            sessionId: registeredPeer.sessionId,
            peerId: registeredPeer.peerId,
            detail: joinAuditDetail
          });
          return;
        }

        if (envelope.sessionId !== registeredPeer.sessionId) {
          throw new Error("Message session does not match registered peer");
        }

        assertRegisteredPeerStillInRoom(rooms, registeredPeer);
        assertRegisteredPeerCanForward(envelope, registeredPeer);

        const recipientPeers = rooms.peers(registeredPeer.sessionId, registeredPeer.peerId);
        const recipient = assertSingleRecipient(recipientPeers);
        assertEnvelopeTargetsRecipient(envelope, recipient);

        for (const peer of recipientPeers) {
          peer.send(encodeProtocolEnvelope(envelope));
        }
        writeRelayAudit(auditSink, {
          action: "relay.message.forwarded",
          outcome: "accepted",
          sessionId: registeredPeer.sessionId,
          peerId: registeredPeer.peerId,
          detail: acceptedForwardAuditDetail(envelope, recipient)
        });
      } catch (error) {
        const reason = safeRelayRejectionReason(error);
        const decision = invalidMessageLimiter.consume(registeredPeer?.peerId ?? remoteKey);
        writeRelayAudit(auditSink, {
          action: "relay.message.rejected",
          outcome: "failed",
          sessionId: registeredPeer?.sessionId,
          peerId: registeredPeer?.peerId,
          reason,
          detail: {
            registered: Boolean(registeredPeer),
            rateLimit: rateLimitAuditDetail(decision)
          }
        });
        socket.send(
          stringifyJson({
            type: "relay-error",
            reason
          })
        );
        if (!decision.allowed) {
          socket.close(1008, "Relay message rate limit exceeded");
        }
      }
    });

    socket.on("error", (error) => {
      const reason = websocketErrorReason(error);
      if (!reason) {
        return;
      }

      const decision = invalidMessageLimiter.consume(registeredPeer?.peerId ?? remoteKey);
      writeRelayAudit(auditSink, {
        action: "relay.message.rejected",
        outcome: "failed",
        sessionId: registeredPeer?.sessionId,
        peerId: registeredPeer?.peerId,
        reason,
        detail: {
          registered: Boolean(registeredPeer),
          transport: "websocket",
          rateLimit: rateLimitAuditDetail(decision)
        }
      });
      if (!decision.allowed && socket.readyState === WebSocket.OPEN) {
        socket.close(1008, "Relay message rate limit exceeded");
      }
    });

    socket.on("close", () => {
      stopHeartbeat();
      if (registeredPeer) {
        const reasonCode = disconnectReasonCode;
        const notification = encodeProtocolEnvelope({
          ...createMessageBase(registeredPeer.sessionId),
          type: "peer-disconnected",
          peerId: registeredPeer.peerId,
          role: registeredPeer.role,
          reasonCode
        });

        const leaveResult = rooms.leave(registeredPeer.sessionId, registeredPeer.peerId);
        const { remainingPeers, removedPeers } = leaveResult;

        let notificationSentCount = 0;
        let notificationFailedCount = 0;

        for (const peer of remainingPeers) {
          try {
            if (peer.send(notification)) {
              notificationSentCount += 1;
            } else {
              notificationFailedCount += 1;
            }
          } catch {
            notificationFailedCount += 1;
          }
        }

        for (const peer of removedPeers) {
          peer.close(1000, ORPHANED_VIEWER_CLOSE_REASON);
        }

        writeRelayAudit(auditSink, {
          action: "relay.peer.disconnect",
          outcome: "accepted",
          sessionId: registeredPeer.sessionId,
          peerId: registeredPeer.peerId,
          detail: {
            role: registeredPeer.role,
            reasonCode,
            notificationTargetCount: remainingPeers.length,
            notificationSentCount,
            notificationFailedCount,
            orphanedPeerDisconnectCount: removedPeers.length
          }
        });
      }
    });
  });

  return {
    async start() {
      if (startState !== "idle") {
        throw new Error(RELAY_RUNTIME_ALREADY_STARTED_ERROR_MESSAGE);
      }

      startState = "starting";
      try {
        await listen(server, wss, port);
        startState = "started";
      } catch (error) {
        startState = "idle";
        throw error;
      }

      if (!sharedToken) {
        try {
          logger.warn(
            "[winbridge-relay] Development mode: WINBRIDGE_RELAY_SHARED_TOKEN is not set. Do not use this as production authorization."
          );
          writeRelayAudit(auditSink, {
            action: "relay.start.development-mode",
            outcome: "accepted",
            detail: { sharedAccessConfigured: false }
          });
        } catch (error) {
          try {
            await closeHttpServer(server);
          } finally {
            startState = "idle";
          }
          throw error;
        }
      }

      logger.log(`[winbridge-relay] Listening on ${serverUrl(server)}`);
    },

    async stop() {
      for (const client of wss.clients) {
        client.close();
      }

      await closeWebSocketServer(wss);
      await closeHttpServer(server);
      startState = "idle";
    },

    url() {
      return serverUrl(server);
    }
  };
}

function readSingleRelayToken(requestUrl: URL): { presented: boolean; value?: string } {
  const tokenEntries = Array.from(requestUrl.searchParams).filter(
    ([name]) => name.toLowerCase() === "token"
  );
  const canonicalTokenValues = tokenEntries
    .filter(([name]) => name === "token")
    .map(([, value]) => value);

  return {
    presented: tokenEntries.length > 0,
    value:
      tokenEntries.length === 1 && canonicalTokenValues.length === 1
        ? canonicalTokenValues[0]
        : undefined
  };
}

function rawDataByteLength(data: RawData): number {
  if (Array.isArray(data)) {
    return data.reduce((total, chunk) => total + chunk.byteLength, 0);
  }

  return data.byteLength;
}

function rawDataToString(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }

  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  return Buffer.from(data).toString("utf8");
}

function websocketErrorReason(error: Error): string | undefined {
  const code = (error as { code?: unknown }).code;
  if (code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") {
    return RELAY_MESSAGE_TOO_LARGE_REASON;
  }

  return undefined;
}

function safeRelayRejectionReason(error: unknown): string {
  if (!(error instanceof Error)) {
    return GENERIC_RELAY_REJECTION_REASON;
  }

  const exactReason = SAFE_RELAY_REJECTION_REASONS.has(error.message)
    ? error.message
    : undefined;
  if (exactReason) {
    return exactReason;
  }

  if (error.message.includes("Signal payload must be 16384 bytes or less")) {
    return "Signal payload must be 16384 bytes or less";
  }

  if (error.message.includes("Signal payload must not be empty")) {
    return "Signal payload must not be empty";
  }

  if (error.message.includes("Signal payload must not contain sensitive remote-assistance data")) {
    return "Signal payload must not contain sensitive remote-assistance data";
  }

  return GENERIC_RELAY_REJECTION_REASON;
}

function startPeerHeartbeat(options: {
  auditSink: AuditSink;
  config: RelayHeartbeatConfig;
  getPeer: () => RelayPeer | undefined;
  onTimeout: () => void;
  socket: WebSocket;
}): () => void {
  let heartbeatState = createRelayHeartbeatState();
  let heartbeatTimeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  const clearHeartbeatTimeout = () => {
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
      heartbeatTimeout = undefined;
    }
  };

  const terminateForTimeout = () => {
    if (
      timedOut ||
      !isHeartbeatTimedOut(heartbeatState, Date.now(), options.config.timeoutMs)
    ) {
      return;
    }

    timedOut = true;
    clearHeartbeatTimeout();
    options.onTimeout();

    const peer = options.getPeer();
    writeRelayAudit(options.auditSink, {
      action: "relay.peer.heartbeat.timeout",
      outcome: "failed",
      sessionId: peer?.sessionId,
      peerId: peer?.peerId,
      reason: "Peer missed relay heartbeat",
      detail: {
        registered: Boolean(peer),
        role: peer?.role ?? "unregistered",
        intervalMs: options.config.intervalMs,
        timeoutMs: options.config.timeoutMs
      }
    });

    options.socket.terminate();
  };

  const sendHeartbeat = () => {
    if (options.socket.readyState !== WebSocket.OPEN || heartbeatState.awaitingPong) {
      return;
    }

    heartbeatState = markHeartbeatPing(heartbeatState);
    options.socket.ping();
    clearHeartbeatTimeout();
    heartbeatTimeout = setTimeout(terminateForTimeout, options.config.timeoutMs);
  };

  const heartbeatInterval = setInterval(sendHeartbeat, options.config.intervalMs);
  const onPong = () => {
    heartbeatState = markHeartbeatPong(heartbeatState);
    clearHeartbeatTimeout();
  };

  options.socket.on("pong", onPong);

  return () => {
    clearInterval(heartbeatInterval);
    clearHeartbeatTimeout();
    options.socket.off("pong", onPong);
  };
}

function registerFirstMessage(
  rooms: RoomRegistry,
  envelope: ProtocolEnvelope,
  send: (data: string) => boolean,
  close: (code: number, reason: string) => void
): {
  peer: RelayPeer;
  result: RelayJoinResult;
  deviceIdentity?: RelayJoinAuditDeviceIdentity;
} {
  const join = JoinSessionMessageSchema.parse(envelope);
  const peer = {
    peerId: join.peerId,
    role: join.role,
    sessionId: join.sessionId,
    deviceId: join.deviceIdentity?.deviceId ?? developmentDeviceIdForPeer(join.peerId),
    pairingCode: join.pairingCode,
    send,
    close
  };

  const result = rooms.join(peer);
  const registeredPeer = result.peers.find((existing) => existing.peerId === peer.peerId);

  if (!registeredPeer) {
    throw new Error("Peer was not registered");
  }

  return {
    peer: registeredPeer,
    result,
    deviceIdentity: relayJoinAuditDeviceIdentity(join.deviceIdentity, join.pairingCode)
  };
}

function relayJoinAuditDeviceIdentity(
  deviceIdentity: DeviceIdentity | undefined,
  pairingCode: string
): RelayJoinAuditDeviceIdentity | undefined {
  if (!deviceIdentity) {
    return undefined;
  }

  return relayAuditDeviceIdentity(deviceIdentity, pairingCode);
}

function relayAuditDeviceIdentity(
  deviceIdentity: DeviceIdentity,
  pairingCode: string,
  options: RelayAuditDeviceIdentityOptions = {}
): RelayJoinAuditDeviceIdentity {
  const auditIdentity: RelayJoinAuditDeviceIdentity = {
    createdAt: deviceIdentity.createdAt,
    platform: deviceIdentity.platform,
    trustLevel: deviceIdentity.trustLevel
  };

  if (
    !options.redactDeviceId &&
    isRelayAuditIdentifierSafe(deviceIdentity.deviceId, pairingCode)
  ) {
    auditIdentity.deviceId = deviceIdentity.deviceId;
  } else {
    auditIdentity.deviceIdRedacted = true;
    auditIdentity.deviceIdLength = deviceIdentity.deviceId.length;
  }

  return auditIdentity;
}

function assertRegisteredPeerStillInRoom(rooms: RoomRegistry, peer: RelayPeer): void {
  if (!rooms.hasPeer(peer.sessionId, peer.peerId)) {
    throw new Error(STALE_REGISTERED_PEER_REASON);
  }
}

function assertRegisteredPeerCanForward(envelope: ProtocolEnvelope, peer: RelayPeer): void {
  switch (envelope.type) {
    case "join-session":
      throw new Error("Registered peers cannot send join-session messages");
    case "relay-ready":
      throw new Error("Relay-ready messages are relay-originated");
    case "peer-disconnected":
      throw new Error("Peer disconnect notices are relay-originated");
    case "hello":
      assertEnvelopePeer(envelope.peerId, peer);
      assertEnvelopeRole(envelope.role, peer);
      return;
    case "host-consent-required":
      assertEnvelopeRole("viewer", peer);
      assertEnvelopePeer(envelope.viewerPeerId, peer);
      return;
    case "host-consent-decision":
      assertEnvelopeRole("host", peer);
      assertEnvelopePeer(envelope.hostPeerId, peer);
      return;
    case "session-authorization-request":
      assertEnvelopeRole("viewer", peer);
      assertEnvelopePeer(envelope.viewerPeerId, peer);
      return;
    case "session-authorization-decision":
      assertEnvelopeRole("host", peer);
      assertEnvelopePeer(envelope.hostPeerId, peer);
      return;
    case "signal":
      assertEnvelopePeer(envelope.fromPeerId, peer);
      return;
    case "session-authorization-state":
    case "permission-revoked":
    case "session-control":
    case "audit-event":
      assertEnvelopeRole("host", peer);
      assertEnvelopePeer(envelope.actorPeerId, peer);
      return;
    default: {
      const exhaustive: never = envelope;
      return exhaustive;
    }
  }
}

function acceptedForwardAuditDetail(
  envelope: ProtocolEnvelope,
  recipient: RelayPeer
): AuditDetail {
  const detail: AuditDetail = {
    messageType: envelope.type,
    messageId: envelope.messageId,
    recipientRole: recipient.role
  };

  applyRelayAuditIdentifierDetail(detail, "recipientPeerId", recipient.peerId);

  const authorizationId = forwardAuditAuthorizationId(envelope);
  if (authorizationId) {
    detail.authorizationId = authorizationId;
  }

  return detail;
}

function applyRelayAuditIdentifierDetail(
  detail: AuditDetail,
  fieldName: string,
  identifier: string
): void {
  if (isRelayAuditIdentifierSafe(identifier)) {
    detail[fieldName] = identifier;
    return;
  }

  detail[`${fieldName}Redacted`] = true;
  detail[`${fieldName}Length`] = identifier.length;
}

function forwardAuditAuthorizationId(envelope: ProtocolEnvelope): string | undefined {
  switch (envelope.type) {
    case "session-authorization-decision":
    case "session-authorization-state":
    case "permission-revoked":
    case "session-control":
      return envelope.authorizationId;
    case "signal": {
      const authorizationId = envelope.payload.authorizationId;
      return typeof authorizationId === "string" ? authorizationId : undefined;
    }
    default:
      return undefined;
  }
}

function assertEnvelopePeer(peerId: string, peer: RelayPeer): void {
  if (peerId !== peer.peerId) {
    throw new Error("Message peer identity does not match registered peer");
  }
}

function assertEnvelopeRole(role: RelayPeer["role"], peer: RelayPeer): void {
  if (role !== peer.role) {
    throw new Error("Message role does not match registered peer");
  }
}

function assertSingleRecipient(peers: RelayPeer[]): RelayPeer {
  const [peer] = peers;
  if (peers.length !== 1 || !peer) {
    throw new Error("No recipient peer is registered");
  }

  return peer;
}

function assertEnvelopeTargetsRecipient(envelope: ProtocolEnvelope, recipient: RelayPeer): void {
  switch (envelope.type) {
    case "host-consent-required":
    case "session-authorization-request":
      assertRecipientRole("host", recipient);
      return;
    case "host-consent-decision":
    case "session-authorization-decision":
      assertRecipientRole("viewer", recipient);
      assertTargetPeer(envelope.viewerPeerId, recipient);
      return;
    case "signal":
      if (envelope.toPeerId) {
        assertTargetPeer(envelope.toPeerId, recipient);
      }
      return;
    case "hello":
    case "session-authorization-state":
    case "permission-revoked":
    case "session-control":
    case "audit-event":
      return;
    case "join-session":
    case "relay-ready":
    case "peer-disconnected":
      return;
    default: {
      const exhaustive: never = envelope;
      return exhaustive;
    }
  }
}

function assertRecipientRole(role: RelayPeer["role"], recipient: RelayPeer): void {
  if (recipient.role !== role) {
    throw new Error("Message target does not match registered recipient");
  }
}

function assertTargetPeer(peerId: string, recipient: RelayPeer): void {
  if (peerId !== recipient.peerId) {
    throw new Error("Message target does not match registered recipient");
  }
}

function rateLimitAuditDetail(decision: RateLimitDecision) {
  return {
    allowed: decision.allowed,
    limit: decision.limit,
    remaining: decision.remaining,
    resetAt: decision.resetAt
  };
}

function normalizeRelayPort(port: unknown): number {
  if (typeof port !== "number" || !Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Relay port must be an integer from 0 through 65535");
  }

  return port;
}

export function createRelayPairingConfig(
  env: NodeJS.ProcessEnv = process.env
): RelayPairingConfig {
  return {
    ticketTtlMs: parseBoundedIntegerEnv(
      env.WINBRIDGE_RELAY_PAIRING_TICKET_TTL_MS,
      DEFAULT_RELAY_PAIRING_TICKET_TTL_MS,
      0,
      MAX_RELAY_PAIRING_TICKET_TTL_MS,
      "WINBRIDGE_RELAY_PAIRING_TICKET_TTL_MS"
    ),
    maxUses: parseBoundedIntegerEnv(
      env.WINBRIDGE_RELAY_PAIRING_TICKET_MAX_USES,
      DEFAULT_RELAY_PAIRING_TICKET_MAX_USES,
      1,
      MAX_RELAY_PAIRING_TICKET_MAX_USES,
      "WINBRIDGE_RELAY_PAIRING_TICKET_MAX_USES"
    )
  };
}

export function createRelayPortConfig(
  env: NodeJS.ProcessEnv = process.env
): number {
  if (env.WINBRIDGE_RELAY_PORT === "") {
    throw new Error("WINBRIDGE_RELAY_PORT must be between 0 and 65535");
  }

  return parseBoundedIntegerEnv(
    env.WINBRIDGE_RELAY_PORT,
    8787,
    0,
    65_535,
    "WINBRIDGE_RELAY_PORT"
  );
}

export function createRelaySharedTokenConfig(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (env.WINBRIDGE_RELAY_SHARED_TOKEN === undefined) {
    return undefined;
  }

  return normalizeRelaySharedToken(env.WINBRIDGE_RELAY_SHARED_TOKEN);
}

function normalizeRelaySharedToken(sharedToken: unknown): string | undefined {
  if (sharedToken === undefined) {
    return undefined;
  }

  if (
    typeof sharedToken !== "string" ||
    sharedToken.trim().length === 0 ||
    sharedToken !== sharedToken.trim() ||
    Buffer.byteLength(sharedToken, "utf8") > MAX_RELAY_SHARED_TOKEN_BYTES ||
    hasAsciiControlCharacter(sharedToken) ||
    hasUnsafeTokenFormatCharacter(sharedToken)
  ) {
    throw new Error(RELAY_SHARED_TOKEN_ERROR_MESSAGE);
  }

  return sharedToken;
}

function hasAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) {
      return true;
    }
  }

  return false;
}

function hasUnsafeTokenFormatCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);

    if (
      codePoint === 0x061c ||
      codePoint === 0x200b ||
      codePoint === 0x200c ||
      codePoint === 0x200d ||
      codePoint === 0x200e ||
      codePoint === 0x200f ||
      codePoint === 0x2060 ||
      codePoint === 0xfeff ||
      (codePoint !== undefined && codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint !== undefined && codePoint >= 0x2066 && codePoint <= 0x2069)
    ) {
      return true;
    }
  }

  return false;
}

function parseNonNegativeIntegerEnv(
  raw: string | undefined,
  fallback: number,
  name: string
): number {
  if (raw === undefined) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);

  if (!Number.isInteger(value) || value < 0 || String(value) !== raw) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return value;
}

function parseBoundedIntegerEnv(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string
): number {
  const value = parseNonNegativeIntegerEnv(raw, fallback, name);

  if (value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }

  return value;
}

function developmentDeviceIdForPeer(peerId: string): string {
  const candidate = `dev_${peerId}`;
  const padded = candidate.length >= 8 ? candidate : `${candidate}_peer`;
  return padded.length <= 128 ? padded : padded.slice(0, 128);
}

function joinDenialAuditAttribution(
  envelope: ProtocolEnvelope,
  options: JoinDenialAuditAttributionOptions = {}
): {
  sessionId?: string;
  peerId?: string;
  detail: AuditDetail;
} {
  if (envelope.type !== "join-session") {
    return { detail: {} };
  }

  const detail: AuditDetail = {};
  const sessionIdSafe = isRelayAuditIdentifierSafe(envelope.sessionId, envelope.pairingCode);
  const peerIdSafe = isRelayAuditIdentifierSafe(envelope.peerId, envelope.pairingCode);
  const attemptedDeviceIdentity = relayDeniedJoinAuditDeviceIdentity(
    envelope.deviceIdentity,
    envelope.pairingCode,
    options.redactAttemptedDeviceId ? { redactDeviceId: true } : undefined
  );

  if (!sessionIdSafe) {
    detail.attemptedSessionIdRedacted = true;
    detail.attemptedSessionIdLength = envelope.sessionId.length;
  }

  if (!peerIdSafe) {
    detail.attemptedPeerIdRedacted = true;
    detail.attemptedPeerIdLength = envelope.peerId.length;
  }

  if (attemptedDeviceIdentity) {
    detail.attemptedDeviceIdentity = attemptedDeviceIdentity;
  }

  return {
    sessionId: sessionIdSafe ? envelope.sessionId : undefined,
    peerId: peerIdSafe ? envelope.peerId : undefined,
    detail
  };
}

function isRelayAuditIdentifierSafe(identifier: string, pairingCode?: string): boolean {
  return (
    (pairingCode === undefined || !identifier.includes(pairingCode)) &&
    !hasSecretBearingProtocolIdentifierMetadata(identifier)
  );
}

function relayDeniedJoinAuditDeviceIdentity(
  deviceIdentity: DeviceIdentity | undefined,
  pairingCode: string,
  options: RelayAuditDeviceIdentityOptions = {}
): RelayDeniedJoinAuditDeviceIdentity | undefined {
  if (!deviceIdentity) {
    return undefined;
  }

  return relayAuditDeviceIdentity(deviceIdentity, pairingCode, options);
}

function pairingDeniedAuditDetail(reason: string) {
  return {
    ticketMissing: reason === "Host pairing ticket required",
    credentialMismatch: reason === "Pairing code mismatch",
    ticketExpired: reason === "Pairing ticket is expired",
    ticketConsumed: reason === "Pairing ticket has no remaining uses",
    selfPairing: reason === SELF_PAIRING_DEVICE_REJECTION_REASON,
    duplicatePeer: reason === DUPLICATE_RELAY_PEER_JOIN_REASON,
    roleConflict: reason === SAME_ROLE_RELAY_PEER_JOIN_REASON
  };
}

function listen(server: Server, wss: WebSocketServer, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      server.off("error", onError);
      server.off("listening", onListening);
      wss.off("error", onError);
    };
    const onError = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(error);
    };
    const onListening = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    wss.once("error", onError);
    server.listen(port, "127.0.0.1");
  });
}

function closeWebSocketServer(wss: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    wss.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function serverUrl(server: Server): string {
  const address = server.address() as AddressInfo | null;

  if (!address) {
    return "ws://127.0.0.1:0";
  }

  return `ws://127.0.0.1:${address.port}`;
}
