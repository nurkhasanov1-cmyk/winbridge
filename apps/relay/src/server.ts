import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket, { WebSocketServer } from "ws";
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
  JoinSessionMessageSchema,
  type ProtocolEnvelope
} from "@winbridge/protocol";
import { RoomRegistry, type RelayPeer } from "./rooms.js";

export type RelayRuntimeOptions = {
  port?: number;
  sharedToken?: string;
  rooms?: RoomRegistry;
  auditSink?: AuditSink;
  heartbeat?: RelayHeartbeatSetting;
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

export function createRelayRuntime(options: RelayRuntimeOptions = {}): RelayRuntime {
  const port = options.port ?? 8787;
  const sharedToken = options.sharedToken;
  const rooms = options.rooms ?? new RoomRegistry();
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
  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket, request) => {
    const requestUrl = new URL(request.url ?? "/", "ws://localhost");
    const token = requestUrl.searchParams.get("token");
    const remoteKey = request.socket.remoteAddress ?? "unknown-remote";

    if (sharedToken && token !== sharedToken) {
      const decision = invalidTokenLimiter.consume(remoteKey);
      writeRelayAudit(auditSink, {
        action: "relay.token.denied",
        outcome: "denied",
        detail: {
          accessPresented: Boolean(token),
          rateLimit: rateLimitAuditDetail(decision)
        }
      });
      socket.close(1008, decision.allowed ? "Invalid relay token" : "Relay token rate limit exceeded");
      return;
    }

    let registeredPeer: RelayPeer | undefined;
    const stopHeartbeat = heartbeat
      ? startPeerHeartbeat({
          auditSink,
          config: heartbeat,
          getPeer: () => registeredPeer,
          socket
        })
      : () => undefined;

    socket.on("message", (data) => {
      try {
        const envelope = decodeProtocolEnvelope(data.toString());

        if (!registeredPeer) {
          try {
            registeredPeer = registerFirstMessage(rooms, envelope, (payload) => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(payload);
              }
            });
          } catch (error) {
            const reason = error instanceof Error ? error.message : "Join rejected";
            writeRelayAudit(auditSink, {
              action: "relay.peer.join.denied",
              outcome: "denied",
              reason,
              detail: { messageType: envelope.type }
            });
            throw error;
          }

          const ready = encodeProtocolEnvelope({
            ...createMessageBase(registeredPeer.sessionId),
            type: "relay-ready",
            peerId: registeredPeer.peerId,
            roomSize: rooms.size(registeredPeer.sessionId)
          });
          socket.send(ready);
          writeRelayAudit(auditSink, {
            action: "relay.peer.join.accepted",
            outcome: "accepted",
            sessionId: registeredPeer.sessionId,
            peerId: registeredPeer.peerId,
            detail: { role: registeredPeer.role, roomSize: rooms.size(registeredPeer.sessionId) }
          });
          return;
        }

        if (envelope.sessionId !== registeredPeer.sessionId) {
          throw new Error("Message session does not match registered peer");
        }

        for (const peer of rooms.peers(registeredPeer.sessionId, registeredPeer.peerId)) {
          peer.send(encodeProtocolEnvelope(envelope));
        }
        writeRelayAudit(auditSink, {
          action: "relay.message.forwarded",
          outcome: "accepted",
          sessionId: registeredPeer.sessionId,
          peerId: registeredPeer.peerId,
          detail: { messageType: envelope.type }
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Invalid relay message";
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
          JSON.stringify({
            type: "relay-error",
            reason
          })
        );
        if (!decision.allowed) {
          socket.close(1008, "Relay message rate limit exceeded");
        }
      }
    });

    socket.on("close", () => {
      stopHeartbeat();
      if (registeredPeer) {
        rooms.leave(registeredPeer.sessionId, registeredPeer.peerId);
        writeRelayAudit(auditSink, {
          action: "relay.peer.disconnect",
          outcome: "accepted",
          sessionId: registeredPeer.sessionId,
          peerId: registeredPeer.peerId,
          detail: { role: registeredPeer.role }
        });
      }
    });
  });

  return {
    async start() {
      if (!sharedToken) {
        logger.warn(
          "[winbridge-relay] Development mode: WINBRIDGE_RELAY_SHARED_TOKEN is not set. Do not use this as production authorization."
        );
        writeRelayAudit(auditSink, {
          action: "relay.start.development-mode",
          outcome: "accepted",
          detail: { sharedAccessConfigured: false }
        });
      }

      await listen(server, port);
      logger.log(`[winbridge-relay] Listening on ${serverUrl(server)}`);
    },

    async stop() {
      for (const client of wss.clients) {
        client.close();
      }

      await closeWebSocketServer(wss);
      await closeHttpServer(server);
    },

    url() {
      return serverUrl(server);
    }
  };
}

function startPeerHeartbeat(options: {
  auditSink: AuditSink;
  config: RelayHeartbeatConfig;
  getPeer: () => RelayPeer | undefined;
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
  send: (data: string) => void
): RelayPeer {
  const join = JoinSessionMessageSchema.parse(envelope);
  const peer: RelayPeer = {
    peerId: join.peerId,
    role: join.role,
    sessionId: join.sessionId,
    pairingCode: join.pairingCode,
    send
  };

  const peers = rooms.join(peer);
  const mismatch = peers.find((existing) => existing.pairingCode !== peer.pairingCode);

  if (mismatch) {
    rooms.leave(peer.sessionId, peer.peerId);
    throw new Error("Pairing code mismatch");
  }

  return peer;
}

function rateLimitAuditDetail(decision: RateLimitDecision) {
  return {
    allowed: decision.allowed,
    limit: decision.limit,
    remaining: decision.remaining,
    resetAt: decision.resetAt
  };
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
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
