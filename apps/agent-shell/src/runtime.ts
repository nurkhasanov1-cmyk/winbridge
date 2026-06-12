import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import type { AuditSink } from "@winbridge/audit-log";
import {
  createDeviceIdentity,
  createMessageBase,
  decodeProtocolEnvelope,
  DeviceIdentitySchema,
  encodeProtocolEnvelope,
  PairingCodeSchema,
  PeerIdSchema,
  PermissionSchema,
  parseProtocolEnvelope,
  SessionIdSchema,
  SessionRoleSchema,
  type AuditOutcome,
  type Permission,
  type ProtocolEnvelope,
  type SessionAuthorizationStatus,
  type SessionRole
} from "@winbridge/protocol";

export type HostDecision = "none" | "approve" | "deny";

export type AgentShellRuntimeOptions = {
  role: SessionRole;
  relayUrl: string;
  sessionId: string;
  pairingCode: string;
  peerId: string;
  displayName: string;
  token?: string;
  deviceId: string;
  requestedPermissions?: Permission[];
  hostDecision?: HostDecision;
  visibleToHost?: boolean;
  decisionReason?: string;
  authorizationTtlMs?: number;
  hostRevokeAfterMs?: number;
  hostRevokePermission?: Permission;
  hostRevokeReason?: string;
  hostPauseAfterMs?: number;
  hostPauseReason?: string;
  hostResumeAfterMs?: number;
  hostResumeReason?: string;
  hostTerminateAfterMs?: number;
  hostTerminateReason?: string;
  auditSink?: AuditSink;
  logger?: {
    log(message: string): void;
    error(message: string): void;
  };
  onEvent?: (event: AgentShellEvent) => void;
};

export type AgentShellEvent =
  | { direction: "sent"; message: AgentShellSentProtocolEnvelope }
  | { direction: "received"; message: AgentShellReceivedProtocolEnvelope }
  | { direction: "raw"; text: typeof REDACTED_EVENT_VALUE; byteLength: number }
  | { direction: "error"; error: Error; messageBytes: number }
  | { direction: "closed"; code: number; reason: typeof REDACTED_EVENT_VALUE; reasonBytes: number };

export type AgentShellErrorDiagnostic = {
  messageBytes: number;
};

export type AgentShellErrorLogKind = "runtime" | "socket";

export type AgentShellSentProtocolEnvelope = AgentShellReasonRedacted<
  | Exclude<ProtocolEnvelope, { type: "join-session" | "signal" }>
  | (Omit<Extract<ProtocolEnvelope, { type: "join-session" }>, "pairingCode"> & {
      pairingCode: typeof REDACTED_EVENT_VALUE;
    })
  | AgentShellSignalEventEnvelope
>;

export type AgentShellReceivedProtocolEnvelope = AgentShellReasonRedacted<
  | Exclude<ProtocolEnvelope, { type: "signal" }>
  | AgentShellSignalEventEnvelope
>;

export type AgentShellSignalEventEnvelope = Omit<Extract<ProtocolEnvelope, { type: "signal" }>, "payload"> & {
  payload: AgentShellSignalPayloadSummary;
};

export type AgentShellSignalPayloadSummary = {
  redacted: typeof REDACTED_EVENT_VALUE;
  byteLength: number;
};

export type AgentShellReasonRedacted<T> = T extends unknown
  ? "reason" extends keyof T
    ? Omit<T, "reason"> &
        (undefined extends T["reason"]
          ? { reason?: typeof REDACTED_EVENT_VALUE }
          : { reason: typeof REDACTED_EVENT_VALUE })
    : T
  : never;

export type AgentShellRuntime = {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: ProtocolEnvelope): void;
};

export const MAX_AGENT_SHELL_REASON_LENGTH = 240;
export const MAX_AGENT_SHELL_TOKEN_BYTES = 1024;
export const MAX_AGENT_SHELL_TIMER_DELAY_MS = 2_147_483_647;

const HOST_DECISION_ERROR_MESSAGE = "Host decision must be one of: none, approve, deny";
const RUNTIME_DISPLAY_NAME_ERROR_MESSAGE = "Runtime display name must be non-blank and 120 characters or less";
const RUNTIME_IDENTIFIER_ERROR_MESSAGE = "Runtime protocol identifiers are invalid";
const RUNTIME_PERMISSION_ERROR_MESSAGE = "Runtime requested permissions must be valid and unique";
const RUNTIME_RELAY_URL_ERROR_MESSAGE = "Runtime relay URL must be an absolute ws or wss URL";
const RUNTIME_REVOKE_PERMISSION_ERROR_MESSAGE = "Runtime revoke permission must be valid";
const RUNTIME_ROLE_ERROR_MESSAGE = "Runtime role must be host or viewer";
const RUNTIME_TOKEN_ERROR_MESSAGE =
  "Runtime token must be non-blank, 1024 UTF-8 bytes or less, and contain no ASCII control characters";
const RUNTIME_VISIBLE_SESSION_ERROR_MESSAGE = "Runtime visibleToHost must be a boolean when provided";
const RUNTIME_WORKFLOW_REASON_ERROR_MESSAGE =
  "Runtime workflow reasons must be non-blank and 240 characters or less";
const RUNTIME_WORKFLOW_TIMER_ERROR_MESSAGE =
  "Runtime workflow timer delays must be integers from 0 through 2147483647";
const AGENT_SHELL_RUNTIME_ERROR_MESSAGE = "Agent shell runtime error";
const AGENT_SHELL_PEER_DISCONNECTED_ERROR_MESSAGE = "Agent shell peer is disconnected";
const AGENT_SHELL_SIGNAL_AUTHORIZATION_ERROR_MESSAGE =
  "Agent shell signal requires active visible screen authorization";
const REDACTED_EVENT_VALUE = "[REDACTED]";
const VALID_HOST_DECISIONS = new Set(["none", "approve", "deny"]);
const VIEWER_SIGNAL_REQUIRED_PERMISSION: Permission = "screen:view";

type HostWorkflowState = {
  terminalStatus?: "revoked" | "terminated" | "expired";
  paused: boolean;
  permissions: Permission[];
};

type AgentShellSessionState = {
  remotePeerDisconnected: boolean;
  helloSent: boolean;
  viewerAuthorization?: ViewerAuthorizationSnapshot;
};

type ViewerAuthorizationSnapshot = {
  authorizationId: string;
  status: SessionAuthorizationStatus;
  visibleToHost: boolean;
  permissions: Permission[];
  expiresAt?: string;
};

export function createAgentShellRuntime(options: AgentShellRuntimeOptions): AgentShellRuntime {
  const relayUrl = validateRuntimeOptions(options);

  const logger = options.logger ?? console;
  let socket: WebSocket | undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const sessionState: AgentShellSessionState = {
    remotePeerDisconnected: false,
    helloSent: false
  };

  if (options.token) {
    relayUrl.searchParams.set("token", options.token);
  }

  const scheduleTimer = (callback: () => void, delayMs: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      try {
        callback();
      } catch (error) {
        reportRuntimeError(options, error);
      }
    }, delayMs);
    timers.add(timer);
  };

  return {
    async start() {
      socket = new WebSocket(relayUrl);

      socket.on("message", (data) => {
        handleMessage(data.toString(), socket, options, sessionState, scheduleTimer);
      });

      socket.on("close", (code, reason) => {
        const reasonBytes = reason.length;
        const event = { direction: "closed", code, reason: REDACTED_EVENT_VALUE, reasonBytes } as const;
        options.onEvent?.(event);
        logger.log(`[winbridge-agent] disconnected code=${code} reasonBytes=${reasonBytes}`);
      });

      socket.on("error", (error) => {
        logger.error(formatAgentShellErrorLog("socket", error));
      });

      await new Promise<void>((resolve, reject) => {
        socket?.once("open", () => {
          logger.log(`[winbridge-agent] ${options.role} connected to ${relayUrl.origin}`);
          logger.log("[winbridge-agent] Native screen capture and remote input are not implemented.");
          logger.log("[winbridge-agent] This shell only exercises the consent/session protocol.");

          const deviceIdentity = createDeviceIdentity({
            displayName: options.displayName,
            platform: currentPlatform(),
            deviceId: options.deviceId
          });

          sendProtocol(socket, options, {
            ...createMessageBase(options.sessionId),
            type: "join-session",
            peerId: options.peerId,
            role: options.role,
            pairingCode: PairingCodeSchema.parse(options.pairingCode),
            deviceIdentity
          });

          resolve();
        });
        socket?.once("error", reject);
      });
    },

    async stop() {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();

      if (!socket || socket.readyState === WebSocket.CLOSED) {
        return;
      }

      await new Promise<void>((resolve) => {
        socket?.once("close", () => resolve());
        socket?.close();
      });
    },

    send(message: ProtocolEnvelope) {
      if (!socket) {
        throw new Error("Agent shell runtime is not started");
      }

      if (sessionState.remotePeerDisconnected) {
        throw new Error(AGENT_SHELL_PEER_DISCONNECTED_ERROR_MESSAGE);
      }

      assertViewerSignalSendAuthorized(message, options, sessionState);
      sendProtocol(socket, options, message);
    }
  };
}

function handleMessage(
  text: string,
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  scheduleTimer: (callback: () => void, delayMs: number) => void
): void {
  let envelope: ProtocolEnvelope;

  try {
    envelope = decodeProtocolEnvelope(text);
  } catch {
    const byteLength = Buffer.byteLength(text);
    options.onEvent?.({ direction: "raw", text: REDACTED_EVENT_VALUE, byteLength });
    options.logger?.log(`[winbridge-agent] received non-protocol message bytes=${byteLength}`);
    return;
  }

  if (envelope.sessionId !== options.sessionId) {
    reportIgnoredUnsafeProtocolMessage(text, options);
    return;
  }

  if (isSelfReferentialAuthorizationRequest(envelope, options)) {
    reportIgnoredUnsafeProtocolMessage(text, options);
    return;
  }

  if (isForeignRelayReady(envelope, options)) {
    reportIgnoredUnsafeProtocolMessage(text, options);
    return;
  }

  if (isSelfDisconnectNotice(envelope, options)) {
    reportIgnoredUnsafeProtocolMessage(text, options);
    return;
  }

  if (isSelfHelloMessage(envelope, options)) {
    reportIgnoredUnsafeProtocolMessage(text, options);
    return;
  }

  if (isMisdirectedSignal(envelope, options)) {
    reportIgnoredUnsafeProtocolMessage(text, options);
    return;
  }

  if (isSelfAuthorityWorkflowMessage(envelope, options)) {
    reportIgnoredUnsafeProtocolMessage(text, options);
    return;
  }

  options.onEvent?.({ direction: "received", message: redactReceivedEventMessage(envelope) });
  options.logger?.log(`[winbridge-agent] ${summarizeProtocolMessage(envelope)}`);

  try {
    updateViewerAuthorizationState(options, sessionState, envelope);

    if (envelope.type === "peer-disconnected") {
      sessionState.remotePeerDisconnected = true;
    }

    if (envelope.type === "relay-ready" && envelope.roomSize >= 2) {
      sendHelloOnce(socket, options, sessionState);

      if (options.role === "viewer") {
        sendViewerAuthorizationRequest(socket, options);
      }
    }

    if (envelope.type === "hello") {
      sendHelloOnce(socket, options, sessionState);
    }

    if (envelope.type === "session-authorization-request" && options.role === "host") {
      handleHostAuthorizationRequest(socket, options, envelope, sessionState, scheduleTimer);
    }
  } catch (error) {
    reportRuntimeError(options, error);
  }
}

function isSelfReferentialAuthorizationRequest(
  envelope: ProtocolEnvelope,
  options: AgentShellRuntimeOptions
): boolean {
  return envelope.type === "session-authorization-request" && envelope.viewerPeerId === options.peerId;
}

function isForeignRelayReady(
  envelope: ProtocolEnvelope,
  options: AgentShellRuntimeOptions
): boolean {
  return envelope.type === "relay-ready" && envelope.peerId !== options.peerId;
}

function isSelfDisconnectNotice(
  envelope: ProtocolEnvelope,
  options: AgentShellRuntimeOptions
): boolean {
  return envelope.type === "peer-disconnected" && envelope.peerId === options.peerId;
}

function isSelfHelloMessage(
  envelope: ProtocolEnvelope,
  options: AgentShellRuntimeOptions
): boolean {
  return envelope.type === "hello" && envelope.peerId === options.peerId;
}

function isMisdirectedSignal(
  envelope: ProtocolEnvelope,
  options: AgentShellRuntimeOptions
): boolean {
  return (
    envelope.type === "signal" &&
    (envelope.toPeerId !== options.peerId || envelope.fromPeerId === options.peerId)
  );
}

function isSelfAuthorityWorkflowMessage(
  envelope: ProtocolEnvelope,
  options: AgentShellRuntimeOptions
): boolean {
  if (envelope.type === "session-authorization-decision") {
    return envelope.hostPeerId === options.peerId;
  }

  return (
    (envelope.type === "session-authorization-state" ||
      envelope.type === "session-control" ||
      envelope.type === "permission-revoked" ||
      envelope.type === "audit-event") &&
    envelope.actorPeerId === options.peerId
  );
}

function reportIgnoredUnsafeProtocolMessage(
  text: string,
  options: AgentShellRuntimeOptions
): void {
  const byteLength = Buffer.byteLength(text);
  options.onEvent?.({ direction: "raw", text: REDACTED_EVENT_VALUE, byteLength });
  options.logger?.log(`[winbridge-agent] ignored unsafe inbound protocol message bytes=${byteLength}`);
}

function updateViewerAuthorizationState(
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  envelope: ProtocolEnvelope
): void {
  if (options.role !== "viewer") {
    return;
  }

  switch (envelope.type) {
    case "session-authorization-decision":
      sessionState.viewerAuthorization = {
        authorizationId: envelope.authorizationId,
        status: envelope.decision === "approved" ? "approved" : "denied",
        visibleToHost: false,
        permissions: [...envelope.grantedPermissions],
        expiresAt: envelope.expiresAt
      };
      return;
    case "session-authorization-state":
      sessionState.viewerAuthorization = {
        authorizationId: envelope.authorizationId,
        status: envelope.status,
        visibleToHost: envelope.visibleToHost,
        permissions: [...envelope.permissions],
        expiresAt: envelope.expiresAt
      };
      return;
    case "permission-revoked":
      updateViewerAuthorizationAfterPermissionRevoke(
        sessionState,
        envelope.authorizationId,
        envelope.revokedPermission
      );
      return;
    case "session-control":
      updateViewerAuthorizationAfterSessionControl(sessionState, envelope);
      return;
    default:
      return;
  }
}

function updateViewerAuthorizationAfterPermissionRevoke(
  sessionState: AgentShellSessionState,
  authorizationId: string,
  revokedPermission: Permission
): void {
  const snapshot = sessionState.viewerAuthorization;
  if (!snapshot || snapshot.authorizationId !== authorizationId) {
    return;
  }

  sessionState.viewerAuthorization = removeViewerAuthorizationPermission(snapshot, revokedPermission);
}

function updateViewerAuthorizationAfterSessionControl(
  sessionState: AgentShellSessionState,
  message: Extract<ProtocolEnvelope, { type: "session-control" }>
): void {
  const snapshot = sessionState.viewerAuthorization;
  if (!snapshot) {
    return;
  }

  switch (message.action) {
    case "pause":
      sessionState.viewerAuthorization = { ...snapshot, status: "paused" };
      return;
    case "terminate":
      sessionState.viewerAuthorization = {
        ...snapshot,
        status: "terminated",
        permissions: []
      };
      return;
    case "revoke-permission":
      if (!message.permission) {
        return;
      }

      sessionState.viewerAuthorization = removeViewerAuthorizationPermission(snapshot, message.permission);
      return;
    case "resume":
      return;
    default: {
      const exhaustive: never = message.action;
      return exhaustive;
    }
  }
}

function removeViewerAuthorizationPermission(
  snapshot: ViewerAuthorizationSnapshot,
  permission: Permission
): ViewerAuthorizationSnapshot {
  const permissions = snapshot.permissions.filter((existing) => existing !== permission);

  return {
    ...snapshot,
    permissions,
    status: permissions.length === 0 ? "revoked" : snapshot.status
  };
}

function assertViewerSignalSendAuthorized(
  message: ProtocolEnvelope,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState
): void {
  if (options.role !== "viewer" || message.type !== "signal") {
    return;
  }

  const snapshot = sessionState.viewerAuthorization;
  if (
    !snapshot ||
    snapshot.status !== "active" ||
    !snapshot.visibleToHost ||
    !snapshot.expiresAt ||
    hasAuthorizationExpired(snapshot.expiresAt) ||
    !snapshot.permissions.includes(VIEWER_SIGNAL_REQUIRED_PERMISSION)
  ) {
    throw new Error(AGENT_SHELL_SIGNAL_AUTHORIZATION_ERROR_MESSAGE);
  }
}

function sendHelloOnce(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState
): void {
  if (sessionState.helloSent || sessionState.remotePeerDisconnected) {
    return;
  }

  sendProtocol(socket, options, {
    ...createMessageBase(options.sessionId),
    type: "hello",
    peerId: options.peerId,
    role: options.role,
    displayName: options.displayName,
    capabilities: ["session:visible", "consent:required", "audit:stdout"]
  });
  sessionState.helloSent = true;
}

function summarizeProtocolMessage(envelope: ProtocolEnvelope): string {
  const summary = [`received ${envelope.type}`, `messageId=${envelope.messageId}`];

  if ("authorizationId" in envelope) {
    summary.push(`authorizationId=${envelope.authorizationId}`);
  }

  if ("status" in envelope) {
    summary.push(`status=${envelope.status}`);
  }

  if ("decision" in envelope) {
    summary.push(`decision=${envelope.decision}`);
  }

  if (envelope.type === "peer-disconnected") {
    summary.push(`peerId=${envelope.peerId}`);
    summary.push(`role=${envelope.role}`);
    summary.push(`reasonCode=${envelope.reasonCode}`);
  }

  return summary.join(" ");
}

function sendViewerAuthorizationRequest(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions
): void {
  const requestedPermissions = options.requestedPermissions ?? [];

  if (requestedPermissions.length === 0) {
    return;
  }

  sendProtocol(socket, options, {
    ...createMessageBase(options.sessionId),
    type: "session-authorization-request",
    viewerPeerId: options.peerId,
    requestedPermissions,
    reason: "Development agent-shell request"
  });
}

function handleHostAuthorizationRequest(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  request: Extract<ProtocolEnvelope, { type: "session-authorization-request" }>,
  sessionState: AgentShellSessionState,
  scheduleTimer: (callback: () => void, delayMs: number) => void
): void {
  const decision = options.hostDecision ?? "none";
  const workflowState: HostWorkflowState = {
    paused: false,
    permissions: [...request.requestedPermissions]
  };

  switch (decision) {
    case "none":
      options.logger?.log("[winbridge-agent] authorization request received; no host decision configured");
      return;
    case "deny": {
      const authorizationId = `authz_${randomUUID()}`;
      sendProtocol(socket, options, {
        ...createMessageBase(options.sessionId),
        type: "session-authorization-decision",
        authorizationId,
        hostPeerId: options.peerId,
        viewerPeerId: request.viewerPeerId,
        decision: "denied",
        grantedPermissions: [],
        reason: options.decisionReason ?? "Host denied"
      });
      sendDevelopmentAuditEvent(socket, options, {
        action: "agent-shell.authorization.denied",
        outcome: "denied",
        detail: {
          requestedPermissionCount: request.requestedPermissions.length,
          reasonConfigured: Boolean(options.decisionReason)
        }
      });
      return;
    }
    case "approve":
      break;
    default:
      throw new Error(HOST_DECISION_ERROR_MESSAGE);
  }

  const authorizationId = `authz_${randomUUID()}`;
  const expiresAt = new Date(Date.now() + (options.authorizationTtlMs ?? 10 * 60_000)).toISOString();

  sendProtocol(socket, options, {
    ...createMessageBase(options.sessionId),
    type: "session-authorization-decision",
    authorizationId,
    hostPeerId: options.peerId,
    viewerPeerId: request.viewerPeerId,
    decision: "approved",
    grantedPermissions: request.requestedPermissions,
    expiresAt
  });
  sendDevelopmentAuditEvent(socket, options, {
    action: "agent-shell.authorization.approved",
    outcome: "accepted",
    detail: {
      requestedPermissionCount: request.requestedPermissions.length,
      grantedPermissionCount: request.requestedPermissions.length
    }
  });

  if (!options.visibleToHost) {
    options.logger?.log("[winbridge-agent] approval sent; active state withheld because visible session is false");
    return;
  }

  sendProtocol(socket, options, {
    ...createMessageBase(options.sessionId),
    type: "session-authorization-state",
    authorizationId,
    actorPeerId: options.peerId,
    status: "active",
    visibleToHost: true,
    permissions: request.requestedPermissions,
    expiresAt
  });
  sendDevelopmentAuditEvent(socket, options, {
    action: "agent-shell.authorization.active",
    outcome: "accepted",
    detail: {
      grantedPermissionCount: request.requestedPermissions.length,
      visibleToHost: true
    }
  });

  scheduleHostRevoke(socket, options, request, authorizationId, expiresAt, workflowState, sessionState, scheduleTimer);
  scheduleHostTerminate(socket, options, request, authorizationId, expiresAt, workflowState, sessionState, scheduleTimer);
  scheduleHostPause(socket, options, authorizationId, expiresAt, workflowState, sessionState, scheduleTimer);
  scheduleHostExpiration(socket, options, request, authorizationId, expiresAt, workflowState, sessionState, scheduleTimer);
}

function assertValidHostDecision(value: unknown): asserts value is HostDecision | undefined {
  if (value === undefined) {
    return;
  }

  if (typeof value === "string" && VALID_HOST_DECISIONS.has(value)) {
    return;
  }

  throw new Error(HOST_DECISION_ERROR_MESSAGE);
}

function validateRuntimeOptions(options: AgentShellRuntimeOptions): URL {
  const relayUrl = parseRuntimeRelayUrl(options.relayUrl);

  assertRuntimeRole(options.role);
  assertRuntimeIdentifiers(options);
  assertRuntimeDisplayName(options.displayName);
  assertRuntimeToken(options.token);
  assertRuntimeRequestedPermissions(options.requestedPermissions);
  assertRuntimeRevokePermission(options.hostRevokePermission);
  assertRuntimeVisibleToHost(options.visibleToHost);
  assertValidHostDecision(options.hostDecision);
  assertRuntimeWorkflowTimers([
    options.authorizationTtlMs,
    options.hostRevokeAfterMs,
    options.hostPauseAfterMs,
    options.hostResumeAfterMs,
    options.hostTerminateAfterMs
  ]);
  assertRuntimeWorkflowReasons([
    options.decisionReason,
    options.hostRevokeReason,
    options.hostPauseReason,
    options.hostResumeReason,
    options.hostTerminateReason
  ]);

  return relayUrl;
}

function parseRuntimeRelayUrl(value: unknown): URL {
  if (typeof value !== "string") {
    throw new Error(RUNTIME_RELAY_URL_ERROR_MESSAGE);
  }

  let relayUrl: URL;
  try {
    relayUrl = new URL(value);
  } catch {
    throw new Error(RUNTIME_RELAY_URL_ERROR_MESSAGE);
  }

  if (relayUrl.protocol !== "ws:" && relayUrl.protocol !== "wss:") {
    throw new Error(RUNTIME_RELAY_URL_ERROR_MESSAGE);
  }

  if (relayUrl.username || relayUrl.password || relayUrlHasUserInfoMarker(value)) {
    throw new Error(RUNTIME_RELAY_URL_ERROR_MESSAGE);
  }

  if (relayUrl.searchParams.has("token")) {
    throw new Error(RUNTIME_RELAY_URL_ERROR_MESSAGE);
  }

  return relayUrl;
}

function relayUrlHasUserInfoMarker(raw: string): boolean {
  const authorityStart = raw.indexOf("://");
  if (authorityStart === -1) {
    return false;
  }

  const authorityRemainder = raw.slice(authorityStart + 3);
  const authorityEnd = authorityRemainder.search(/[/?#]/);
  const authority =
    authorityEnd === -1 ? authorityRemainder : authorityRemainder.slice(0, authorityEnd);

  return authority.includes("@");
}

function assertRuntimeRole(value: unknown): asserts value is SessionRole {
  try {
    SessionRoleSchema.parse(value);
  } catch {
    throw new Error(RUNTIME_ROLE_ERROR_MESSAGE);
  }
}

function assertRuntimeIdentifiers(options: AgentShellRuntimeOptions): void {
  try {
    SessionIdSchema.parse(options.sessionId);
    PairingCodeSchema.parse(options.pairingCode);
    PeerIdSchema.parse(options.peerId);
    DeviceIdentitySchema.shape.deviceId.parse(options.deviceId);
  } catch {
    throw new Error(RUNTIME_IDENTIFIER_ERROR_MESSAGE);
  }
}

function assertRuntimeDisplayName(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(RUNTIME_DISPLAY_NAME_ERROR_MESSAGE);
  }

  try {
    DeviceIdentitySchema.shape.displayName.parse(value);
  } catch {
    throw new Error(RUNTIME_DISPLAY_NAME_ERROR_MESSAGE);
  }
}

function assertRuntimeToken(value: unknown): asserts value is string | undefined {
  if (value === undefined) {
    return;
  }

  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    Buffer.byteLength(value, "utf8") > MAX_AGENT_SHELL_TOKEN_BYTES ||
    hasAsciiControlCharacter(value)
  ) {
    throw new Error(RUNTIME_TOKEN_ERROR_MESSAGE);
  }
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

function assertRuntimeRequestedPermissions(value: unknown): asserts value is Permission[] | undefined {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value) || value.length > 16) {
    throw new Error(RUNTIME_PERMISSION_ERROR_MESSAGE);
  }

  try {
    for (const permission of value) {
      PermissionSchema.parse(permission);
    }
  } catch {
    throw new Error(RUNTIME_PERMISSION_ERROR_MESSAGE);
  }

  if (new Set(value).size !== value.length) {
    throw new Error(RUNTIME_PERMISSION_ERROR_MESSAGE);
  }
}

function assertRuntimeRevokePermission(value: unknown): asserts value is Permission | undefined {
  if (value === undefined) {
    return;
  }

  try {
    PermissionSchema.parse(value);
  } catch {
    throw new Error(RUNTIME_REVOKE_PERMISSION_ERROR_MESSAGE);
  }
}

function assertRuntimeVisibleToHost(value: unknown): asserts value is boolean | undefined {
  if (value === undefined || typeof value === "boolean") {
    return;
  }

  throw new Error(RUNTIME_VISIBLE_SESSION_ERROR_MESSAGE);
}

function assertRuntimeWorkflowTimers(values: unknown[]): void {
  for (const value of values) {
    if (value === undefined) {
      continue;
    }

    if (
      !Number.isInteger(value) ||
      (value as number) < 0 ||
      (value as number) > MAX_AGENT_SHELL_TIMER_DELAY_MS
    ) {
      throw new Error(RUNTIME_WORKFLOW_TIMER_ERROR_MESSAGE);
    }
  }
}

function assertRuntimeWorkflowReasons(values: unknown[]): void {
  for (const value of values) {
    if (value === undefined) {
      continue;
    }

    if (
      typeof value !== "string" ||
      value.trim().length === 0 ||
      value.length > MAX_AGENT_SHELL_REASON_LENGTH
    ) {
      throw new Error(RUNTIME_WORKFLOW_REASON_ERROR_MESSAGE);
    }
  }
}

function scheduleHostRevoke(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  request: Extract<ProtocolEnvelope, { type: "session-authorization-request" }>,
  authorizationId: string,
  expiresAt: string,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  scheduleTimer: (callback: () => void, delayMs: number) => void
): void {
  if (options.hostRevokeAfterMs === undefined) {
    return;
  }

  if (!options.hostRevokePermission) {
    options.logger?.log("[winbridge-agent] revoke delay configured without revoke permission");
    return;
  }

  if (!request.requestedPermissions.includes(options.hostRevokePermission)) {
    options.logger?.log("[winbridge-agent] revoke permission was not granted in the request");
    return;
  }

  const revokedPermission = options.hostRevokePermission;
  const reason = options.hostRevokeReason ?? `Host revoked ${revokedPermission}`;

  scheduleTimer(() => {
    if (workflowState.terminalStatus) {
      options.logger?.log(`[winbridge-agent] revoke skipped because authorization is ${workflowState.terminalStatus}`);
      return;
    }

    if (!canSendDelayedHostWorkflow(socket, options, sessionState, "revoke")) {
      return;
    }

    if (hasAuthorizationExpired(expiresAt)) {
      options.logger?.log("[winbridge-agent] revoke skipped because authorization is expired");
      return;
    }

    const remainingPermissions = workflowState.permissions.filter(
      (permission) => permission !== revokedPermission
    );
    const finalGrantRevoked = remainingPermissions.length === 0;
    workflowState.permissions = remainingPermissions;

    if (finalGrantRevoked) {
      workflowState.terminalStatus = "revoked";
    }

    sendProtocol(socket, options, {
      ...createMessageBase(options.sessionId),
      type: "permission-revoked",
      authorizationId,
      actorPeerId: options.peerId,
      revokedPermission,
      reason
    });

    sendProtocol(socket, options, {
      ...createMessageBase(options.sessionId),
      type: "session-authorization-state",
      authorizationId,
      actorPeerId: options.peerId,
      status: finalGrantRevoked ? "revoked" : workflowState.paused ? "paused" : "active",
      visibleToHost: true,
      permissions: remainingPermissions,
      expiresAt,
      reason
    });
    sendDevelopmentAuditEvent(socket, options, {
      action: "agent-shell.permission.revoked",
      outcome: "accepted",
      detail: {
        revokedPermission,
        remainingPermissionCount: remainingPermissions.length,
        finalGrantRevoked
      }
    });
  }, options.hostRevokeAfterMs);
}

function scheduleHostPause(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  authorizationId: string,
  expiresAt: string,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  scheduleTimer: (callback: () => void, delayMs: number) => void
): void {
  if (options.hostPauseAfterMs === undefined) {
    if (options.hostResumeAfterMs !== undefined) {
      options.logger?.log("[winbridge-agent] resume delay configured without pause delay");
    }
    return;
  }

  const reason = options.hostPauseReason ?? "Host paused session";

  scheduleTimer(() => {
    if (workflowState.terminalStatus) {
      options.logger?.log(`[winbridge-agent] pause skipped because authorization is ${workflowState.terminalStatus}`);
      return;
    }

    if (workflowState.paused) {
      options.logger?.log("[winbridge-agent] pause skipped because authorization is already paused");
      return;
    }

    if (!canSendDelayedHostWorkflow(socket, options, sessionState, "pause")) {
      return;
    }

    if (hasAuthorizationExpired(expiresAt)) {
      options.logger?.log("[winbridge-agent] pause skipped because authorization is expired");
      return;
    }

    workflowState.paused = true;

    sendProtocol(socket, options, {
      ...createMessageBase(options.sessionId),
      type: "session-control",
      actorPeerId: options.peerId,
      action: "pause",
      reason
    });

    sendProtocol(socket, options, {
      ...createMessageBase(options.sessionId),
      type: "session-authorization-state",
      authorizationId,
      actorPeerId: options.peerId,
      status: "paused",
      visibleToHost: true,
      permissions: workflowState.permissions,
      expiresAt,
      reason
    });

    sendDevelopmentAuditEvent(socket, options, {
      action: "agent-shell.authorization.paused",
      outcome: "accepted",
      detail: {
        grantedPermissionCount: workflowState.permissions.length,
        visibleToHost: true,
        paused: true,
        reasonConfigured: Boolean(options.hostPauseReason)
      }
    });

    scheduleHostResume(socket, options, authorizationId, expiresAt, workflowState, sessionState, scheduleTimer);
  }, options.hostPauseAfterMs);
}

function scheduleHostResume(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  authorizationId: string,
  expiresAt: string,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  scheduleTimer: (callback: () => void, delayMs: number) => void
): void {
  if (options.hostResumeAfterMs === undefined) {
    return;
  }

  const reason = options.hostResumeReason ?? "Host resumed session";

  scheduleTimer(() => {
    if (workflowState.terminalStatus) {
      options.logger?.log(`[winbridge-agent] resume skipped because authorization is ${workflowState.terminalStatus}`);
      return;
    }

    if (!workflowState.paused) {
      options.logger?.log("[winbridge-agent] resume skipped because authorization is not paused");
      return;
    }

    if (!canSendDelayedHostWorkflow(socket, options, sessionState, "resume")) {
      return;
    }

    if (hasAuthorizationExpired(expiresAt)) {
      options.logger?.log("[winbridge-agent] resume skipped because authorization is expired");
      return;
    }

    workflowState.paused = false;

    sendProtocol(socket, options, {
      ...createMessageBase(options.sessionId),
      type: "session-control",
      actorPeerId: options.peerId,
      action: "resume",
      reason
    });

    sendProtocol(socket, options, {
      ...createMessageBase(options.sessionId),
      type: "session-authorization-state",
      authorizationId,
      actorPeerId: options.peerId,
      status: "active",
      visibleToHost: true,
      permissions: workflowState.permissions,
      expiresAt,
      reason
    });

    sendDevelopmentAuditEvent(socket, options, {
      action: "agent-shell.authorization.resumed",
      outcome: "accepted",
      detail: {
        grantedPermissionCount: workflowState.permissions.length,
        visibleToHost: true,
        resumed: true,
        reasonConfigured: Boolean(options.hostResumeReason)
      }
    });
  }, options.hostResumeAfterMs);
}

function scheduleHostTerminate(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  request: Extract<ProtocolEnvelope, { type: "session-authorization-request" }>,
  authorizationId: string,
  expiresAt: string,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  scheduleTimer: (callback: () => void, delayMs: number) => void
): void {
  if (options.hostTerminateAfterMs === undefined) {
    return;
  }

  const reason = options.hostTerminateReason ?? "Host terminated session";

  scheduleTimer(() => {
    if (workflowState.terminalStatus) {
      return;
    }

    if (!canSendDelayedHostWorkflow(socket, options, sessionState, "terminate")) {
      return;
    }

    if (hasAuthorizationExpired(expiresAt)) {
      options.logger?.log("[winbridge-agent] terminate skipped because authorization is expired");
      return;
    }

    workflowState.terminalStatus = "terminated";

    sendProtocol(socket, options, {
      ...createMessageBase(options.sessionId),
      type: "session-control",
      actorPeerId: options.peerId,
      action: "terminate",
      reason
    });

    sendProtocol(socket, options, {
      ...createMessageBase(options.sessionId),
      type: "session-authorization-state",
      authorizationId,
      actorPeerId: options.peerId,
      status: "terminated",
      visibleToHost: true,
      permissions: [],
      expiresAt,
      reason
    });

    sendDevelopmentAuditEvent(socket, options, {
      action: "agent-shell.authorization.terminated",
      outcome: "accepted",
      detail: {
        previouslyGrantedPermissionCount: request.requestedPermissions.length,
        visibleToHost: true,
        terminated: true
      }
    });
  }, options.hostTerminateAfterMs);
}

function scheduleHostExpiration(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  request: Extract<ProtocolEnvelope, { type: "session-authorization-request" }>,
  authorizationId: string,
  expiresAt: string,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  scheduleTimer: (callback: () => void, delayMs: number) => void
): void {
  const ttlMs = options.authorizationTtlMs ?? 10 * 60_000;

  scheduleTimer(() => {
    if (workflowState.terminalStatus) {
      options.logger?.log(`[winbridge-agent] expiration skipped because authorization is ${workflowState.terminalStatus}`);
      return;
    }

    if (!canSendDelayedHostWorkflow(socket, options, sessionState, "expiration")) {
      return;
    }

    workflowState.terminalStatus = "expired";

    sendProtocol(socket, options, {
      ...createMessageBase(options.sessionId),
      type: "session-authorization-state",
      authorizationId,
      actorPeerId: options.peerId,
      status: "expired",
      visibleToHost: true,
      permissions: [],
      expiresAt,
      reason: "Authorization expired"
    });

    sendDevelopmentAuditEvent(socket, options, {
      action: "agent-shell.authorization.expired",
      outcome: "accepted",
      detail: {
        previouslyGrantedPermissionCount: request.requestedPermissions.length,
        ttlMs,
        visibleToHost: true,
        expired: true
      }
    });
  }, ttlMs);
}

function canSendDelayedHostWorkflow(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  action: string
): boolean {
  if (sessionState.remotePeerDisconnected) {
    options.logger?.log(`[winbridge-agent] ${action} skipped because peer disconnected`);
    return false;
  }

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    options.logger?.log(`[winbridge-agent] ${action} skipped because socket is closed`);
    return false;
  }

  return true;
}

function sendDevelopmentAuditEvent(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  input: {
    action: string;
    outcome: AuditOutcome;
    detail: Record<string, unknown>;
  }
): void {
  const eventId = `audit_${randomUUID()}`;
  options.auditSink?.write({
    eventId,
    actor: {
      type: options.role,
      id: options.peerId,
      deviceId: options.deviceId
    },
    sessionId: options.sessionId,
    action: input.action,
    outcome: input.outcome,
    detail: input.detail
  });

  sendProtocol(socket, options, {
    ...createMessageBase(options.sessionId),
    type: "audit-event",
    eventId,
    actorPeerId: options.peerId,
    action: input.action,
    outcome: input.outcome,
    detail: input.detail
  });
}

export function createAgentShellErrorDiagnostic(error: unknown): AgentShellErrorDiagnostic {
  const message = error instanceof Error ? error.message : AGENT_SHELL_RUNTIME_ERROR_MESSAGE;
  return { messageBytes: Buffer.byteLength(message) };
}

export function formatAgentShellErrorLog(kind: AgentShellErrorLogKind, error: unknown): string {
  const diagnostic = createAgentShellErrorDiagnostic(error);
  return `[winbridge-agent] ${kind} error messageBytes=${diagnostic.messageBytes}`;
}

function createSanitizedRuntimeError(): Error {
  const error = new Error(AGENT_SHELL_RUNTIME_ERROR_MESSAGE);
  error.stack = undefined;
  return error;
}

function reportRuntimeError(options: AgentShellRuntimeOptions, error: unknown): void {
  const diagnostic = createAgentShellErrorDiagnostic(error);
  options.onEvent?.({
    direction: "error",
    error: createSanitizedRuntimeError(),
    messageBytes: diagnostic.messageBytes
  });
  options.logger?.error(formatAgentShellErrorLog("runtime", error));
}

function hasAuthorizationExpired(expiresAt: string): boolean {
  return Date.parse(expiresAt) <= Date.now();
}

function sendProtocol(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  message: ProtocolEnvelope
): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error("Agent shell socket is not open");
  }

  const normalizedMessage = parseProtocolEnvelope(message);
  socket.send(encodeProtocolEnvelope(normalizedMessage));
  options.onEvent?.({ direction: "sent", message: redactSentEventMessage(normalizedMessage) });
}

function redactSentEventMessage(message: ProtocolEnvelope): AgentShellSentProtocolEnvelope {
  if (message.type === "join-session") {
    return redactProtocolReason({
      ...message,
      pairingCode: REDACTED_EVENT_VALUE
    }) as AgentShellSentProtocolEnvelope;
  }

  if (message.type === "signal") {
    return redactProtocolReason(redactSignalEventMessage(message)) as AgentShellSentProtocolEnvelope;
  }

  return redactProtocolReason(message) as AgentShellSentProtocolEnvelope;
}

function redactReceivedEventMessage(message: ProtocolEnvelope): AgentShellReceivedProtocolEnvelope {
  if (message.type === "signal") {
    return redactProtocolReason(redactSignalEventMessage(message)) as AgentShellReceivedProtocolEnvelope;
  }

  return redactProtocolReason(message) as AgentShellReceivedProtocolEnvelope;
}

function redactSignalEventMessage(
  message: Extract<ProtocolEnvelope, { type: "signal" }>
): AgentShellSignalEventEnvelope {
  return {
    ...message,
    payload: {
      redacted: REDACTED_EVENT_VALUE,
      byteLength: Buffer.byteLength(JSON.stringify(message.payload))
    }
  };
}

function redactProtocolReason<T extends object>(message: T): AgentShellReasonRedacted<T> {
  if ("reason" in message && typeof (message as { reason?: unknown }).reason === "string") {
    return {
      ...message,
      reason: REDACTED_EVENT_VALUE
    } as AgentShellReasonRedacted<T>;
  }

  return message as AgentShellReasonRedacted<T>;
}

function currentPlatform() {
  if (process.platform === "win32") {
    return "windows";
  }

  if (process.platform === "darwin") {
    return "macos";
  }

  if (process.platform === "linux") {
    return "linux";
  }

  return "unknown";
}

export function parsePermissions(raw: string | undefined): Permission[] {
  if (!raw) {
    return [];
  }

  const permissions = raw
    .split(",")
    .map((permission) => PermissionSchema.parse(permission.trim()));

  if (new Set(permissions).size !== permissions.length) {
    throw new Error("Requested permissions must be unique");
  }

  return permissions;
}
