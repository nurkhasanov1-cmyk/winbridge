import { randomUUID } from "node:crypto";
import WebSocket, { type RawData } from "ws";
import type { AuditSink } from "@winbridge/audit-log";
import {
  createDeviceIdentity,
  createMessageBase,
  decodeProtocolEnvelope,
  DeviceIdentitySchema,
  encodeProtocolEnvelope,
  hasSecretBearingAuditMetadata,
  PairingCodeSchema,
  PeerIdSchema,
  PermissionSchema,
  parseProtocolEnvelope,
  SessionIdSchema,
  SessionRoleSchema,
  stringifyJson,
  type AuditDetail,
  type AuditOutcome,
  type Permission,
  type ProtocolEnvelope,
  type SessionAuthorizationStatus,
  type SessionRole
} from "@winbridge/protocol";

export type HostDecision = "none" | "approve" | "deny";
export type HostDecisionProvider = (
  request: HostDecisionProviderRequest
) => HostDecision | null | undefined | Promise<HostDecision | null | undefined>;

export type HostDecisionProviderRequest = {
  viewerPeerId: string;
  viewerDisplayName?: string;
  requestedPermissions: Permission[];
  requestedPermissionCount: number;
};

type DevelopmentAuditInput = {
  action: string;
  outcome: AuditOutcome;
  detail: AuditDetail;
};

type DevelopmentAuditEvent = Extract<ProtocolEnvelope, { type: "audit-event" }>;

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
  hostGrantPermissions?: Permission[];
  hostDecision?: HostDecision;
  hostDecisionProvider?: HostDecisionProvider;
  hostConsentTimeoutMs?: number;
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
  hostDisconnectAfterMs?: number;
  hostDisconnectReason?: string;
  hostSignalProbeAck?: boolean;
  viewerSignalProbeAfterMs?: number;
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
  | AgentShellHostIndicatorEvent
  | { direction: "raw"; text: typeof REDACTED_EVENT_VALUE; byteLength: number }
  | { direction: "error"; error: Error; messageBytes: number }
  | { direction: "closed"; code: number; reason: typeof REDACTED_EVENT_VALUE; reasonBytes: number };

export type AgentShellHostIndicatorEvent = {
  direction: "indicator";
  role: "host";
  state: "active" | "paused" | "inactive";
  authorizationId: string;
  authorizationStatus: SessionAuthorizationStatus;
  visibleToHost: boolean;
  permissionCount: number;
  cause:
    | "activated"
    | "paused"
    | "resumed"
    | "permission-revoked"
    | "revoked"
    | "terminated"
    | "expired"
    | "local-disconnect"
    | "peer-disconnected"
    | "runtime-stop"
    | "socket-closed";
};

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
  leave(): Promise<void>;
  getHostStatus(): AgentShellHostStatusSnapshot;
  getViewerStatus(): AgentShellViewerStatusSnapshot;
  disconnect(): void;
  pause(): void;
  revokePermission(permission: Permission): void;
  resume(): void;
  terminate(): void;
  send(message: ProtocolEnvelope): void;
};

export type AgentShellHostStatusSnapshot = {
  state: AgentShellHostIndicatorEvent["state"];
  visibleToHost: boolean;
  permissionCount: number;
  authorizationId?: string;
  authorizationStatus?: SessionAuthorizationStatus;
  inactiveCause?: AgentShellHostIndicatorEvent["cause"];
};

export type AgentShellRemoteDisconnectReasonCode = Extract<
  ProtocolEnvelope,
  { type: "peer-disconnected" }
>["reasonCode"];

export type AgentShellViewerLocalInactiveCause = "local-leave" | "socket-closed";

export type AgentShellViewerStatusSnapshot = {
  state: AgentShellHostIndicatorEvent["state"];
  visibleToHost: boolean;
  permissionCount: number;
  authorizationId?: string;
  authorizationStatus?: SessionAuthorizationStatus;
  remoteDisconnectReasonCode?: AgentShellRemoteDisconnectReasonCode;
  localInactiveCause?: AgentShellViewerLocalInactiveCause;
};

export const MAX_AGENT_SHELL_REASON_LENGTH = 240;
export const MAX_AGENT_SHELL_DISCONNECT_REASON_BYTES = 123;
export const MAX_AGENT_SHELL_TOKEN_BYTES = 1024;
export const MAX_AGENT_SHELL_TIMER_DELAY_MS = 2_147_483_647;
export const DEFAULT_HOST_CONSENT_TIMEOUT_MS = 60_000;

const HOST_DECISION_ERROR_MESSAGE = "Host decision must be one of: none, approve, deny";
const HOST_DECISION_PROVIDER_ERROR_MESSAGE =
  "Host decision provider is only valid for host runtimes without static approval or denial";
const HOST_CONSENT_TIMEOUT_ERROR_MESSAGE =
  "Host consent timeout must be an integer from 1 through 2147483647 and requires an interactive host decision provider";
const RUNTIME_DISPLAY_NAME_ERROR_MESSAGE =
  "Runtime display name must be non-blank, already trimmed, 120 characters or less, contain no ASCII control characters, and contain no Unicode bidi or zero-width formatting controls";
const RUNTIME_IDENTIFIER_ERROR_MESSAGE = "Runtime protocol identifiers are invalid";
const RUNTIME_PERMISSION_ERROR_MESSAGE = "Runtime requested permissions must be valid and unique";
const RUNTIME_HOST_GRANT_SCOPE_ERROR_MESSAGE =
  "Runtime host grant scope requires a host runtime with an approval source and unique non-empty permissions";
const RUNTIME_RELAY_URL_ERROR_MESSAGE = "Runtime relay URL must be an absolute ws or wss URL";
const RUNTIME_REVOKE_PERMISSION_ERROR_MESSAGE = "Runtime revoke permission must be valid";
const RUNTIME_ROLE_ERROR_MESSAGE = "Runtime role must be host or viewer";
const RUNTIME_TOKEN_ERROR_MESSAGE =
  "Runtime token must be non-blank, already trimmed, 1024 UTF-8 bytes or less, contain no ASCII control characters, and contain no Unicode bidi or zero-width formatting controls";
const RUNTIME_VISIBLE_SESSION_ERROR_MESSAGE = "Runtime visibleToHost must be a boolean when provided";
const RUNTIME_WORKFLOW_REASON_ERROR_MESSAGE =
  "Runtime workflow reasons must be non-blank, already trimmed, 240 characters or less, contain no ASCII control characters, and contain no Unicode bidi or zero-width formatting controls";
const RUNTIME_HOST_DISCONNECT_REASON_ERROR_MESSAGE =
  "Runtime host disconnect reason is only valid for host runtimes and must fit WebSocket close reason bounds";
const RUNTIME_VIEWER_REQUEST_OPTIONS_ERROR_MESSAGE =
  "Runtime requested permissions are only valid for viewer runtimes";
const RUNTIME_AUTHORIZATION_TTL_ERROR_MESSAGE =
  "Runtime authorization TTL must be an integer from 1 through 2147483647";
const RUNTIME_WORKFLOW_TIMER_ERROR_MESSAGE =
  "Runtime workflow timer delays must be integers from 0 through 2147483647";
const RUNTIME_VIEWER_SIGNAL_PROBE_ERROR_MESSAGE =
  "Runtime viewer signal probe requires a viewer runtime with requested screen:view permission";
const RUNTIME_HOST_SIGNAL_PROBE_ACK_ERROR_MESSAGE =
  "Runtime host signal probe acknowledgement is only valid for host runtimes";
const RUNTIME_HOST_WORKFLOW_OPTIONS_ERROR_MESSAGE =
  "Runtime host workflow options are only valid for host runtimes";
const AGENT_SHELL_RUNTIME_ERROR_MESSAGE = "Agent shell runtime error";
const AGENT_SHELL_RUNTIME_ALREADY_STARTED_ERROR_MESSAGE = "Agent shell runtime is already started";
const AGENT_SHELL_LOCAL_PEER_DISCONNECTED_ERROR_MESSAGE = "Agent shell local peer is disconnected";
const AGENT_SHELL_PEER_DISCONNECTED_ERROR_MESSAGE = "Agent shell peer is disconnected";
const AGENT_SHELL_LOCAL_DISCONNECT_ROLE_ERROR_MESSAGE =
  "Agent shell local disconnect control is only valid for host runtimes";
const AGENT_SHELL_LOCAL_DISCONNECT_AUTHORIZATION_ERROR_MESSAGE =
  "Agent shell local disconnect control requires active visible host authorization";
const AGENT_SHELL_HOST_STATUS_ROLE_ERROR_MESSAGE =
  "Agent shell host status is only valid for host runtimes";
const AGENT_SHELL_VIEWER_STATUS_ROLE_ERROR_MESSAGE =
  "Agent shell viewer status is only valid for viewer runtimes";
const AGENT_SHELL_VIEWER_LEAVE_ROLE_ERROR_MESSAGE =
  "Agent shell viewer leave is only valid for viewer runtimes";
const AGENT_SHELL_REVOKE_ROLE_ERROR_MESSAGE = "Agent shell revoke control is only valid for host runtimes";
const AGENT_SHELL_REVOKE_AUTHORIZATION_ERROR_MESSAGE =
  "Agent shell revoke control requires active or paused visible host authorization";
const AGENT_SHELL_REVOKE_PERMISSION_ERROR_MESSAGE =
  "Agent shell revoke control requires a currently granted host permission";
const AGENT_SHELL_PAUSE_ROLE_ERROR_MESSAGE = "Agent shell pause control is only valid for host runtimes";
const AGENT_SHELL_PAUSE_AUTHORIZATION_ERROR_MESSAGE =
  "Agent shell pause control requires active visible host authorization";
const AGENT_SHELL_RESUME_ROLE_ERROR_MESSAGE = "Agent shell resume control is only valid for host runtimes";
const AGENT_SHELL_RESUME_AUTHORIZATION_ERROR_MESSAGE =
  "Agent shell resume control requires paused visible host authorization";
const AGENT_SHELL_TERMINATE_ROLE_ERROR_MESSAGE =
  "Agent shell terminate control is only valid for host runtimes";
const AGENT_SHELL_TERMINATE_AUTHORIZATION_ERROR_MESSAGE =
  "Agent shell terminate control requires active or paused visible host authorization";
const AGENT_SHELL_SIGNAL_AUTHORIZATION_ERROR_MESSAGE =
  "Agent shell signal requires active visible screen authorization";
const AGENT_SHELL_SIGNAL_ROUTING_ERROR_MESSAGE =
  "Agent shell signal sender and target must match runtime peer routing";
const AGENT_SHELL_SESSION_ROUTING_ERROR_MESSAGE =
  "Agent shell message must match runtime session";
const AGENT_SHELL_PUBLIC_SEND_AUTHORITY_ERROR_MESSAGE =
  "Agent shell public send message authority is invalid";
const AGENT_SHELL_WORKFLOW_AUTHORITY_SEND_ERROR_MESSAGE =
  "Agent shell workflow authority messages require internal consent workflow";
const AGENT_SHELL_PUBLIC_SEND_RECIPIENT_ERROR_MESSAGE =
  "Agent shell public send requires an observed recipient peer";
const REDACTED_EVENT_VALUE = "[REDACTED]";
const VALID_HOST_DECISIONS = new Set(["none", "approve", "deny"]);
const SIGNAL_REQUIRED_PERMISSION: Permission = "screen:view";
const VIEWER_SIGNAL_PROBE_MARKER = "viewer-signal-probe-v1";
const HOST_SIGNAL_PROBE_ACK_MARKER = "host-signal-probe-ack-v1";
const TERMINAL_AUTHORIZATION_STATUSES = new Set<SessionAuthorizationStatus>([
  "denied",
  "revoked",
  "terminated",
  "expired"
]);

type HostWorkflowState = {
  terminalStatus?: "revoked" | "terminated" | "expired";
  paused: boolean;
  permissions: Permission[];
};

type AgentShellSessionState = {
  localPeerDisconnected: boolean;
  remotePeerDisconnected: boolean;
  remoteDisconnectReasonCode?: AgentShellRemoteDisconnectReasonCode;
  recipientAvailable: boolean;
  observedPeerId?: string;
  observedPeerRole?: SessionRole;
  observedPeerDisplayName?: string;
  helloSent: boolean;
  hostAuthorization?: RuntimeAuthorizationSnapshot;
  hostWorkflowState?: HostWorkflowState;
  viewerAuthorization?: RuntimeAuthorizationSnapshot;
  viewerLocalInactiveCause?: AgentShellViewerLocalInactiveCause;
  viewerSignalProbeAuthorizationId?: string;
  viewerSignalProbeGeneration: number;
  hostSignalProbeAckAuthorizationId?: string;
  hostIndicator?: AgentShellHostIndicatorEvent;
};

type RuntimeAuthorizationSnapshot = {
  authorizationId: string;
  authorityPeerId?: string;
  remotePeerId?: string;
  status: SessionAuthorizationStatus;
  visibleToHost: boolean;
  permissions: Permission[];
  revokedPermissions?: Permission[];
  expiresAt?: string;
};

type VisibleRuntimeAuthorizationSnapshot = RuntimeAuthorizationSnapshot & {
  expiresAt: string;
};

type LocalHostWorkflowControl = {
  authorization: VisibleRuntimeAuthorizationSnapshot;
  workflowState: HostWorkflowState;
};

export function createAgentShellRuntime(options: AgentShellRuntimeOptions): AgentShellRuntime {
  const relayUrl = validateRuntimeOptions(options);

  const logger = options.logger ?? console;
  let socket: WebSocket | undefined;
  let lifecycleSocket: WebSocket | undefined;
  let suppressNextViewerSocketCloseInactiveCause = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const sessionState: AgentShellSessionState = {
    localPeerDisconnected: false,
    remotePeerDisconnected: false,
    recipientAvailable: false,
    helloSent: false,
    viewerSignalProbeGeneration: 0
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

  const stopRuntime = async () => {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
    deactivateHostIndicator(options, sessionState, "runtime-stop");
    resetConnectionScopedSessionState(sessionState);

    const socketToClose = socket;
    socket = undefined;

    if (!socketToClose || socketToClose.readyState === WebSocket.CLOSED) {
      return;
    }

    if (options.role === "viewer") {
      suppressNextViewerSocketCloseInactiveCause = true;
    }

    await new Promise<void>((resolve) => {
      socketToClose.once("close", () => resolve());
      socketToClose.close();
    });
  };

  return {
    async start() {
      assertRuntimeStartAllowed(lifecycleSocket);
      resetConnectionScopedSessionState(sessionState);
      const runtimeSocket = new WebSocket(relayUrl);
      socket = runtimeSocket;
      lifecycleSocket = runtimeSocket;

      runtimeSocket.on("message", (data) => {
        void handleMessage(rawDataToInboundMessage(data), runtimeSocket, options, sessionState, scheduleTimer).catch(
          (error) => reportRuntimeError(options, error)
        );
      });

      runtimeSocket.on("close", (code, reason) => {
        if (lifecycleSocket === runtimeSocket) {
          lifecycleSocket = undefined;
        }
        const reasonBytes = closeReasonByteLength(reason);
        const suppressViewerSocketClosedStatus = suppressNextViewerSocketCloseInactiveCause;
        suppressNextViewerSocketCloseInactiveCause = false;
        sessionState.localPeerDisconnected = true;
        invalidateViewerSignalProbe(sessionState);
        recordViewerSocketClosedStatus(options, sessionState, suppressViewerSocketClosedStatus);
        deactivateHostIndicator(options, sessionState, "socket-closed");
        const event = { direction: "closed", code, reason: REDACTED_EVENT_VALUE, reasonBytes } as const;
        options.onEvent?.(event);
        logger.log(`[winbridge-agent] disconnected code=${code} reasonBytes=${reasonBytes}`);
      });

      runtimeSocket.on("error", (error) => {
        logger.error(formatAgentShellErrorLog("socket", error));
      });

      await new Promise<void>((resolve, reject) => {
        runtimeSocket.once("open", () => {
          logger.log(`[winbridge-agent] ${options.role} connected to ${relayUrl.origin}`);
          logger.log("[winbridge-agent] Native screen capture and remote input are not implemented.");
          logger.log("[winbridge-agent] This shell only exercises the consent/session protocol.");

          const deviceIdentity = createDeviceIdentity({
            displayName: options.displayName,
            platform: currentPlatform(),
            deviceId: options.deviceId
          });

          sendProtocol(runtimeSocket, options, {
            ...createMessageBase(options.sessionId),
            type: "join-session",
            peerId: options.peerId,
            role: options.role,
            pairingCode: PairingCodeSchema.parse(options.pairingCode),
            deviceIdentity
          });

          resolve();
        });
        runtimeSocket.once("error", reject);
      });
    },

    async stop() {
      await stopRuntime();
    },

    async leave() {
      if (options.role !== "viewer") {
        throw new Error(AGENT_SHELL_VIEWER_LEAVE_ROLE_ERROR_MESSAGE);
      }

      await stopRuntime();
      sessionState.viewerLocalInactiveCause = "local-leave";
    },

    getHostStatus() {
      return getHostStatusSnapshot(options, sessionState);
    },

    getViewerStatus() {
      return getViewerStatusSnapshot(options, sessionState);
    },

    disconnect() {
      if (!socket) {
        throw new Error("Agent shell runtime is not started");
      }

      if (sessionState.localPeerDisconnected) {
        throw new Error(AGENT_SHELL_LOCAL_PEER_DISCONNECTED_ERROR_MESSAGE);
      }

      if (sessionState.remotePeerDisconnected) {
        throw new Error(AGENT_SHELL_PEER_DISCONNECTED_ERROR_MESSAGE);
      }

      const authorization = getLocalHostDisconnectAuthorization(options, sessionState);
      closeLocalHostConnection(
        socket,
        options,
        sessionState,
        authorization,
        options.hostDisconnectReason ?? "Host disconnect control",
        "disconnect control closing local relay connection"
      );
    },

    pause() {
      if (!socket) {
        throw new Error("Agent shell runtime is not started");
      }

      if (sessionState.localPeerDisconnected) {
        throw new Error(AGENT_SHELL_LOCAL_PEER_DISCONNECTED_ERROR_MESSAGE);
      }

      if (sessionState.remotePeerDisconnected) {
        throw new Error(AGENT_SHELL_PEER_DISCONNECTED_ERROR_MESSAGE);
      }

      assertLocalRuntimeSocketOpen(socket);
      const { authorization, workflowState } = getLocalHostPauseControl(options, sessionState);
      try {
        pauseHostAuthorization(
          socket,
          options,
          authorization.authorizationId,
          authorization.expiresAt,
          workflowState,
          sessionState,
          options.hostPauseReason ?? "Host paused session",
          Boolean(options.hostPauseReason)
        );
      } catch (error) {
        reportRuntimeError(options, error);
        throw createSanitizedRuntimeError();
      }
    },

    revokePermission(permission: Permission) {
      if (!socket) {
        throw new Error("Agent shell runtime is not started");
      }

      assertRuntimeRevokePermission(permission);

      if (sessionState.localPeerDisconnected) {
        throw new Error(AGENT_SHELL_LOCAL_PEER_DISCONNECTED_ERROR_MESSAGE);
      }

      if (sessionState.remotePeerDisconnected) {
        throw new Error(AGENT_SHELL_PEER_DISCONNECTED_ERROR_MESSAGE);
      }

      assertLocalRuntimeSocketOpen(socket);
      const { authorization, workflowState } = getLocalHostRevokeControl(options, sessionState, permission);
      try {
        revokeHostPermission(
          socket,
          options,
          authorization.authorizationId,
          authorization.expiresAt,
          workflowState,
          sessionState,
          permission,
          options.hostRevokeReason ?? `Host revoked ${permission}`
        );
      } catch (error) {
        reportRuntimeError(options, error);
        throw createSanitizedRuntimeError();
      }
    },

    resume() {
      if (!socket) {
        throw new Error("Agent shell runtime is not started");
      }

      if (sessionState.localPeerDisconnected) {
        throw new Error(AGENT_SHELL_LOCAL_PEER_DISCONNECTED_ERROR_MESSAGE);
      }

      if (sessionState.remotePeerDisconnected) {
        throw new Error(AGENT_SHELL_PEER_DISCONNECTED_ERROR_MESSAGE);
      }

      assertLocalRuntimeSocketOpen(socket);
      const { authorization, workflowState } = getLocalHostResumeControl(options, sessionState);
      try {
        resumeHostAuthorization(
          socket,
          options,
          authorization.authorizationId,
          authorization.expiresAt,
          workflowState,
          sessionState,
          options.hostResumeReason ?? "Host resumed session",
          Boolean(options.hostResumeReason)
        );
      } catch (error) {
        reportRuntimeError(options, error);
        throw createSanitizedRuntimeError();
      }
    },

    terminate() {
      if (!socket) {
        throw new Error("Agent shell runtime is not started");
      }

      if (sessionState.localPeerDisconnected) {
        throw new Error(AGENT_SHELL_LOCAL_PEER_DISCONNECTED_ERROR_MESSAGE);
      }

      if (sessionState.remotePeerDisconnected) {
        throw new Error(AGENT_SHELL_PEER_DISCONNECTED_ERROR_MESSAGE);
      }

      assertLocalRuntimeSocketOpen(socket);
      const { authorization, workflowState } = getLocalHostTerminateControl(options, sessionState);
      try {
        terminateHostAuthorization(
          socket,
          options,
          authorization.authorizationId,
          authorization.expiresAt,
          workflowState,
          sessionState,
          options.hostTerminateReason ?? "Host terminated session",
          Boolean(options.hostTerminateReason)
        );
      } catch (error) {
        reportRuntimeError(options, error);
        throw createSanitizedRuntimeError();
      }
    },

    send(message: ProtocolEnvelope) {
      sendPublicRuntimeMessage(socket, options, sessionState, message);
    }
  };
}

function assertRuntimeStartAllowed(lifecycleSocket: WebSocket | undefined): void {
  if (lifecycleSocket && lifecycleSocket.readyState !== WebSocket.CLOSED) {
    throw new Error(AGENT_SHELL_RUNTIME_ALREADY_STARTED_ERROR_MESSAGE);
  }
}

function closeReasonByteLength(reason: Buffer | string): number {
  if (typeof reason === "string") {
    return Buffer.byteLength(reason, "utf8");
  }

  return reason.byteLength;
}

type AgentShellInboundMessage = {
  byteLength: number;
  text: string;
};

function rawDataToInboundMessage(data: RawData): AgentShellInboundMessage {
  return {
    byteLength: rawDataByteLength(data),
    text: rawDataToString(data)
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

function resetConnectionScopedSessionState(sessionState: AgentShellSessionState): void {
  sessionState.localPeerDisconnected = false;
  sessionState.remotePeerDisconnected = false;
  sessionState.remoteDisconnectReasonCode = undefined;
  sessionState.recipientAvailable = false;
  sessionState.observedPeerId = undefined;
  sessionState.observedPeerRole = undefined;
  sessionState.observedPeerDisplayName = undefined;
  sessionState.helloSent = false;
  sessionState.hostAuthorization = undefined;
  sessionState.hostWorkflowState = undefined;
  sessionState.viewerAuthorization = undefined;
  sessionState.viewerLocalInactiveCause = undefined;
  sessionState.viewerSignalProbeAuthorizationId = undefined;
  sessionState.viewerSignalProbeGeneration = 0;
  sessionState.hostSignalProbeAckAuthorizationId = undefined;
  sessionState.hostIndicator = undefined;
}

function recordViewerSocketClosedStatus(
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  suppressed: boolean
): void {
  if (options.role !== "viewer" || suppressed || sessionState.remotePeerDisconnected) {
    return;
  }

  sessionState.viewerAuthorization = undefined;
  sessionState.viewerLocalInactiveCause = "socket-closed";
}

async function handleMessage(
  inboundMessage: AgentShellInboundMessage,
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  scheduleTimer: (callback: () => void, delayMs: number) => void
): Promise<void> {
  let envelope: ProtocolEnvelope;

  try {
    envelope = decodeProtocolEnvelope(inboundMessage.text);
  } catch {
    const byteLength = inboundMessage.byteLength;
    options.onEvent?.({ direction: "raw", text: REDACTED_EVENT_VALUE, byteLength });
    options.logger?.log(`[winbridge-agent] received non-protocol message bytes=${byteLength}`);
    return;
  }

  if (envelope.sessionId !== options.sessionId) {
    reportIgnoredUnsafeProtocolMessage(inboundMessage.byteLength, options);
    return;
  }

  if (isSelfReferentialAuthorizationRequest(envelope, options)) {
    reportIgnoredUnsafeProtocolMessage(inboundMessage.byteLength, options);
    return;
  }

  if (isForeignRelayReady(envelope, options)) {
    reportIgnoredUnsafeProtocolMessage(inboundMessage.byteLength, options);
    return;
  }

  if (isSelfDisconnectNotice(envelope, options)) {
    reportIgnoredUnsafeProtocolMessage(inboundMessage.byteLength, options);
    return;
  }

  if (isUntrustedPeerDisconnectNotice(envelope, options, sessionState)) {
    reportIgnoredUnsafeProtocolMessage(inboundMessage.byteLength, options);
    return;
  }

  if (isSelfHelloMessage(envelope, options)) {
    reportIgnoredUnsafeProtocolMessage(inboundMessage.byteLength, options);
    return;
  }

  if (isSameRoleHelloMessage(envelope, options)) {
    reportIgnoredUnsafeProtocolMessage(inboundMessage.byteLength, options);
    return;
  }

  if (isMisdirectedSignal(envelope, options)) {
    reportIgnoredUnsafeProtocolMessage(inboundMessage.byteLength, options);
    return;
  }

  if (isSelfAuthorityWorkflowMessage(envelope, options)) {
    reportIgnoredUnsafeProtocolMessage(inboundMessage.byteLength, options);
    return;
  }

  if (isInboundLegacyHostConsentDecision(envelope)) {
    reportIgnoredUnsafeProtocolMessage(inboundMessage.byteLength, options);
    return;
  }

  if (isUntrustedViewerAuthorizationLifecycleMessage(envelope, options, sessionState)) {
    reportIgnoredUnsafeProtocolMessage(inboundMessage.byteLength, options);
    return;
  }

  if (isUnboundHostAuthorizationRequest(envelope, options, sessionState)) {
    reportIgnoredUnsafeProtocolMessage(inboundMessage.byteLength, options);
    return;
  }

  if (isUnauthorizedInboundSignal(envelope, options, sessionState)) {
    reportIgnoredUnsafeProtocolMessage(inboundMessage.byteLength, options);
    return;
  }

  options.onEvent?.({ direction: "received", message: redactReceivedEventMessage(envelope) });
  options.logger?.log(`[winbridge-agent] ${summarizeProtocolMessage(envelope)}`);

  try {
    updateViewerAuthorizationState(options, sessionState, envelope);
    sendHostSignalProbeAck(socket, options, sessionState, envelope);

    if (isViewerAuthorizationLifecycleMessage(envelope) && !hasActiveSignalAuthorization(sessionState.viewerAuthorization)) {
      invalidateViewerSignalProbe(sessionState);
    }

    if (envelope.type === "peer-disconnected") {
      sessionState.remotePeerDisconnected = true;
      sessionState.remoteDisconnectReasonCode = envelope.reasonCode;
      invalidateViewerSignalProbe(sessionState);
      sessionState.recipientAvailable = false;
      sessionState.observedPeerId = undefined;
      sessionState.observedPeerRole = undefined;
      sessionState.observedPeerDisplayName = undefined;
      deactivateHostIndicator(options, sessionState, "peer-disconnected");
    }

    if (envelope.type === "session-authorization-state") {
      scheduleViewerSignalProbe(socket, options, sessionState, scheduleTimer);
    }

    if (envelope.type === "relay-ready" && envelope.roomSize >= 2) {
      sessionState.recipientAvailable = true;
      sendHelloOnce(socket, options, sessionState);

      if (options.role === "viewer") {
        sendViewerAuthorizationRequest(socket, options);
      }
    }

    if (envelope.type === "hello") {
      sessionState.recipientAvailable = true;
      sessionState.observedPeerId = envelope.peerId;
      sessionState.observedPeerRole = envelope.role;
      sessionState.observedPeerDisplayName = envelope.displayName;
      sendHelloOnce(socket, options, sessionState);
    }

    if (envelope.type === "session-authorization-request" && options.role === "host") {
      await handleHostAuthorizationRequest(socket, options, envelope, sessionState, scheduleTimer);
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

function isUntrustedPeerDisconnectNotice(
  envelope: ProtocolEnvelope,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState
): boolean {
  if (envelope.type !== "peer-disconnected") {
    return false;
  }

  return (
    envelope.role === options.role ||
    envelope.peerId !== sessionState.observedPeerId ||
    envelope.role !== sessionState.observedPeerRole
  );
}

function isSelfHelloMessage(
  envelope: ProtocolEnvelope,
  options: AgentShellRuntimeOptions
): boolean {
  return envelope.type === "hello" && envelope.peerId === options.peerId;
}

function isSameRoleHelloMessage(
  envelope: ProtocolEnvelope,
  options: AgentShellRuntimeOptions
): boolean {
  return envelope.type === "hello" && envelope.role === options.role;
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

  if (envelope.type === "host-consent-decision") {
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

function isInboundLegacyHostConsentDecision(envelope: ProtocolEnvelope): boolean {
  return envelope.type === "host-consent-decision";
}

function isUntrustedViewerAuthorizationLifecycleMessage(
  envelope: ProtocolEnvelope,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState
): boolean {
  if (options.role !== "viewer") {
    return false;
  }

  switch (envelope.type) {
    case "session-authorization-decision":
      return (
        envelope.viewerPeerId !== options.peerId ||
        !isObservedHostAuthority(sessionState, envelope.hostPeerId) ||
        isTerminalBoundViewerAuthorizationDecisionReplay(
          sessionState,
          envelope.authorizationId,
          envelope.hostPeerId
        )
      );
    case "session-authorization-state":
      return !hasBoundViewerAuthorizationStateAuthority(
        sessionState,
        envelope.authorizationId,
        envelope.actorPeerId,
        envelope.status
      );
    case "permission-revoked":
      return !hasBoundViewerRevocationAuthority(
        sessionState,
        envelope.authorizationId,
        envelope.actorPeerId
      );
    case "session-control":
      return !hasMutableBoundViewerControlAuthority(
        sessionState,
        envelope.authorizationId,
        envelope.actorPeerId
      );
    case "audit-event":
      return !isObservedHostAuthority(sessionState, envelope.actorPeerId);
    default:
      return false;
  }
}

function isViewerAuthorizationLifecycleMessage(envelope: ProtocolEnvelope): boolean {
  return (
    envelope.type === "session-authorization-decision" ||
    envelope.type === "session-authorization-state" ||
    envelope.type === "permission-revoked" ||
    envelope.type === "session-control"
  );
}

function isUnboundHostAuthorizationRequest(
  envelope: ProtocolEnvelope,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState
): boolean {
  return (
    options.role === "host" &&
    envelope.type === "session-authorization-request" &&
    (sessionState.observedPeerRole !== "viewer" || sessionState.observedPeerId !== envelope.viewerPeerId)
  );
}

function isObservedHostAuthority(
  sessionState: AgentShellSessionState,
  hostPeerId: string
): boolean {
  return sessionState.observedPeerRole === "host" && sessionState.observedPeerId === hostPeerId;
}

function hasBoundViewerAuthorizationStateAuthority(
  sessionState: AgentShellSessionState,
  authorizationId: string,
  actorPeerId: string,
  nextStatus: SessionAuthorizationStatus
): boolean {
  const snapshot = sessionState.viewerAuthorization;

  if (!isBoundViewerAuthorizationAuthority(snapshot, authorizationId, actorPeerId)) {
    return false;
  }

  return !isTerminalAuthorizationStatus(snapshot.status) || snapshot.status === nextStatus;
}

function isTerminalBoundViewerAuthorizationDecisionReplay(
  sessionState: AgentShellSessionState,
  authorizationId: string,
  hostPeerId: string
): boolean {
  const snapshot = sessionState.viewerAuthorization;

  return (
    isBoundViewerAuthorizationAuthority(snapshot, authorizationId, hostPeerId) &&
    isTerminalAuthorizationStatus(snapshot.status)
  );
}

function hasMutableBoundViewerAuthorizationAuthority(
  sessionState: AgentShellSessionState,
  authorizationId: string,
  actorPeerId: string
): boolean {
  const snapshot = sessionState.viewerAuthorization;

  return (
    isBoundViewerAuthorizationAuthority(snapshot, authorizationId, actorPeerId) &&
    !isTerminalAuthorizationStatus(snapshot.status)
  );
}

function hasBoundViewerRevocationAuthority(
  sessionState: AgentShellSessionState,
  authorizationId: string,
  actorPeerId: string
): boolean {
  const snapshot = sessionState.viewerAuthorization;

  return (
    isBoundViewerAuthorizationAuthority(snapshot, authorizationId, actorPeerId) &&
    (!isTerminalAuthorizationStatus(snapshot.status) || snapshot.status === "revoked")
  );
}

function hasMutableBoundViewerControlAuthority(
  sessionState: AgentShellSessionState,
  authorizationId: string,
  actorPeerId: string
): boolean {
  const snapshot = sessionState.viewerAuthorization;

  return (
    isBoundViewerAuthorizationAuthority(snapshot, authorizationId, actorPeerId) &&
    !isTerminalAuthorizationStatus(snapshot.status)
  );
}

function isBoundViewerAuthorizationAuthority(
  snapshot: RuntimeAuthorizationSnapshot | undefined,
  authorizationId: string,
  actorPeerId: string
): snapshot is RuntimeAuthorizationSnapshot {
  return Boolean(
    snapshot &&
      snapshot.authorizationId === authorizationId &&
      snapshot.authorityPeerId === actorPeerId
  );
}

function isTerminalAuthorizationStatus(status: SessionAuthorizationStatus): boolean {
  return TERMINAL_AUTHORIZATION_STATUSES.has(status);
}

function reportIgnoredUnsafeProtocolMessage(
  byteLength: number,
  options: AgentShellRuntimeOptions
): void {
  options.onEvent?.({ direction: "raw", text: REDACTED_EVENT_VALUE, byteLength });
  options.logger?.log(`[winbridge-agent] ignored unsafe inbound protocol message bytes=${byteLength}`);
}

function isUnauthorizedInboundSignal(
  envelope: ProtocolEnvelope,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState
): boolean {
  if (envelope.type !== "signal") {
    return false;
  }

  const snapshot = options.role === "host" ? sessionState.hostAuthorization : sessionState.viewerAuthorization;

  return (
    !hasActiveSignalAuthorization(snapshot) ||
    signalPayloadAuthorizationId(envelope) !== snapshot.authorizationId
  );
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
      if (envelope.viewerPeerId !== options.peerId) {
        return;
      }

      sessionState.viewerAuthorization = applyViewerAuthorizationRevocationFloor(
        {
          authorizationId: envelope.authorizationId,
          authorityPeerId: envelope.hostPeerId,
          remotePeerId: envelope.hostPeerId,
          status: envelope.decision === "approved" ? "approved" : "denied",
          visibleToHost: false,
          permissions: [...envelope.grantedPermissions],
          expiresAt: envelope.expiresAt
        },
        viewerRevokedPermissionsForAuthorization(
          sessionState.viewerAuthorization,
          envelope.authorizationId,
          envelope.hostPeerId
        )
      );
      return;
    case "session-authorization-state":
      if (
        !hasBoundViewerAuthorizationStateAuthority(
          sessionState,
          envelope.authorizationId,
          envelope.actorPeerId,
          envelope.status
        )
      ) {
        return;
      }

      sessionState.viewerAuthorization = applyViewerAuthorizationRevocationFloor(
        {
          authorizationId: envelope.authorizationId,
          authorityPeerId: envelope.actorPeerId,
          remotePeerId: envelope.actorPeerId,
          status: envelope.status,
          visibleToHost: envelope.visibleToHost,
          permissions: [...envelope.permissions],
          expiresAt: envelope.expiresAt
        },
        viewerRevokedPermissionsForAuthorization(
          sessionState.viewerAuthorization,
          envelope.authorizationId,
          envelope.actorPeerId
        )
      );
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
  if (!snapshot || snapshot.authorizationId !== message.authorizationId) {
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
  snapshot: RuntimeAuthorizationSnapshot,
  permission: Permission
): RuntimeAuthorizationSnapshot {
  const permissions = snapshot.permissions.filter((existing) => existing !== permission);
  const revokedPermissions = snapshot.revokedPermissions?.includes(permission)
    ? [...snapshot.revokedPermissions]
    : [...(snapshot.revokedPermissions ?? []), permission];

  return {
    ...snapshot,
    permissions,
    revokedPermissions,
    status: permissions.length === 0 ? "revoked" : snapshot.status
  };
}

function viewerRevokedPermissionsForAuthorization(
  snapshot: RuntimeAuthorizationSnapshot | undefined,
  authorizationId: string,
  authorityPeerId: string
): Permission[] {
  if (!isBoundViewerAuthorizationAuthority(snapshot, authorizationId, authorityPeerId)) {
    return [];
  }

  return [...(snapshot.revokedPermissions ?? [])];
}

function applyViewerAuthorizationRevocationFloor(
  snapshot: RuntimeAuthorizationSnapshot,
  revokedPermissions: Permission[]
): RuntimeAuthorizationSnapshot {
  if (revokedPermissions.length === 0) {
    return snapshot;
  }

  const permissions = snapshot.permissions.filter(
    (permission) => !revokedPermissions.includes(permission)
  );
  const removedByFloor = permissions.length !== snapshot.permissions.length;
  const status =
    removedByFloor && permissions.length === 0 && !isTerminalAuthorizationStatus(snapshot.status)
      ? "revoked"
      : snapshot.status;

  return {
    ...snapshot,
    permissions,
    revokedPermissions: [...revokedPermissions],
    status
  };
}

function sendPublicRuntimeMessage(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  message: ProtocolEnvelope
): void {
  if (!socket) {
    throw new Error("Agent shell runtime is not started");
  }

  if (sessionState.remotePeerDisconnected) {
    throw new Error(AGENT_SHELL_PEER_DISCONNECTED_ERROR_MESSAGE);
  }

  if (sessionState.localPeerDisconnected) {
    throw new Error(AGENT_SHELL_LOCAL_PEER_DISCONNECTED_ERROR_MESSAGE);
  }

  assertPublicSendSession(message, options);
  assertPublicSendAuthority(message, options);
  assertPublicWorkflowAuthoritySendAllowed(message);
  assertSignalPeerRouting(message, options);
  assertSignalSendAuthorized(message, options, sessionState);
  assertPublicSendRecipientAvailable(message, sessionState);
  sendProtocol(socket, options, message);
}

function assertPublicSendSession(message: ProtocolEnvelope, options: AgentShellRuntimeOptions): void {
  if (message.sessionId !== options.sessionId) {
    throw new Error(AGENT_SHELL_SESSION_ROUTING_ERROR_MESSAGE);
  }
}

function assertPublicSendAuthority(message: ProtocolEnvelope, options: AgentShellRuntimeOptions): void {
  switch (message.type) {
    case "join-session":
    case "relay-ready":
    case "peer-disconnected":
      throw new Error(AGENT_SHELL_PUBLIC_SEND_AUTHORITY_ERROR_MESSAGE);
    case "hello":
      if (message.peerId !== options.peerId || message.role !== options.role) {
        throw new Error(AGENT_SHELL_PUBLIC_SEND_AUTHORITY_ERROR_MESSAGE);
      }
      return;
    case "host-consent-required":
    case "session-authorization-request":
      if (options.role !== "viewer" || message.viewerPeerId !== options.peerId) {
        throw new Error(AGENT_SHELL_PUBLIC_SEND_AUTHORITY_ERROR_MESSAGE);
      }
      return;
    default:
      return;
  }
}

function assertSignalPeerRouting(message: ProtocolEnvelope, options: AgentShellRuntimeOptions): void {
  if (message.type !== "signal") {
    return;
  }

  if (message.fromPeerId !== options.peerId || message.toPeerId === options.peerId) {
    throw new Error(AGENT_SHELL_SIGNAL_ROUTING_ERROR_MESSAGE);
  }
}

function assertSignalSendAuthorized(
  message: ProtocolEnvelope,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState
): void {
  if (message.type !== "signal") {
    return;
  }

  const snapshot = options.role === "host" ? sessionState.hostAuthorization : sessionState.viewerAuthorization;
  if (!hasActiveSignalAuthorization(snapshot)) {
    throw new Error(AGENT_SHELL_SIGNAL_AUTHORIZATION_ERROR_MESSAGE);
  }

  if (message.toPeerId && message.toPeerId !== snapshot?.remotePeerId) {
    throw new Error(AGENT_SHELL_SIGNAL_ROUTING_ERROR_MESSAGE);
  }

  if (signalPayloadAuthorizationId(message) !== snapshot.authorizationId) {
    throw new Error(AGENT_SHELL_SIGNAL_AUTHORIZATION_ERROR_MESSAGE);
  }
}

function assertPublicWorkflowAuthoritySendAllowed(message: ProtocolEnvelope): void {
  if (isWorkflowAuthorityMessage(message)) {
    throw new Error(AGENT_SHELL_WORKFLOW_AUTHORITY_SEND_ERROR_MESSAGE);
  }
}

function assertPublicSendRecipientAvailable(
  message: ProtocolEnvelope,
  sessionState: AgentShellSessionState
): void {
  if (isPeerRecipientMessage(message) && !sessionState.recipientAvailable) {
    throw new Error(AGENT_SHELL_PUBLIC_SEND_RECIPIENT_ERROR_MESSAGE);
  }
}

function isWorkflowAuthorityMessage(message: ProtocolEnvelope): boolean {
  return (
    message.type === "host-consent-decision" ||
    message.type === "session-authorization-decision" ||
    message.type === "session-authorization-state" ||
    message.type === "permission-revoked" ||
    message.type === "session-control" ||
    message.type === "audit-event"
  );
}

function isPeerRecipientMessage(message: ProtocolEnvelope): boolean {
  return (
    message.type === "hello" ||
    message.type === "host-consent-required" ||
    message.type === "session-authorization-request" ||
    message.type === "signal"
  );
}

function hasActiveSignalAuthorization(
  snapshot: RuntimeAuthorizationSnapshot | undefined
): snapshot is RuntimeAuthorizationSnapshot {
  return Boolean(
    snapshot &&
      snapshot.status === "active" &&
      snapshot.visibleToHost &&
      snapshot.expiresAt &&
      !hasAuthorizationExpired(snapshot.expiresAt) &&
      snapshot.permissions.includes(SIGNAL_REQUIRED_PERMISSION)
  );
}

function scheduleViewerSignalProbe(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  scheduleTimer: (callback: () => void, delayMs: number) => void
): void {
  if (options.viewerSignalProbeAfterMs === undefined || options.role !== "viewer") {
    return;
  }

  const snapshot = sessionState.viewerAuthorization;
  if (!hasActiveSignalAuthorization(snapshot)) {
    return;
  }

  if (sessionState.viewerSignalProbeAuthorizationId === snapshot.authorizationId) {
    return;
  }

  sessionState.viewerSignalProbeAuthorizationId = snapshot.authorizationId;
  const generation = sessionState.viewerSignalProbeGeneration;
  scheduleTimer(() => {
    if (
      sessionState.viewerSignalProbeGeneration !== generation ||
      sessionState.viewerSignalProbeAuthorizationId !== snapshot.authorizationId
    ) {
      return;
    }

    sendViewerSignalProbe(socket, options, sessionState, snapshot.authorizationId, snapshot.remotePeerId);
  }, options.viewerSignalProbeAfterMs);
}

function invalidateViewerSignalProbe(sessionState: AgentShellSessionState): void {
  sessionState.viewerSignalProbeGeneration += 1;
}

function sendViewerSignalProbe(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  authorizationId: string,
  remotePeerId: string | undefined
): void {
  sendPublicRuntimeMessage(socket, options, sessionState, {
    ...createMessageBase(options.sessionId),
    type: "signal",
    fromPeerId: options.peerId,
    toPeerId: remotePeerId,
    payload: {
      authorizationId,
      probe: VIEWER_SIGNAL_PROBE_MARKER
    }
  });
}

function sendHostSignalProbeAck(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  message: ProtocolEnvelope
): void {
  if (!options.hostSignalProbeAck || options.role !== "host" || message.type !== "signal") {
    return;
  }

  const authorizationId = signalPayloadAuthorizationId(message);
  if (!authorizationId || !isViewerSignalProbePayload(message.payload)) {
    return;
  }

  const snapshot = sessionState.hostAuthorization;
  if (!hasActiveSignalAuthorization(snapshot) || message.fromPeerId !== snapshot.remotePeerId) {
    return;
  }

  if (sessionState.hostSignalProbeAckAuthorizationId === authorizationId) {
    return;
  }

  sendPublicRuntimeMessage(socket, options, sessionState, {
    ...createMessageBase(options.sessionId),
    type: "signal",
    fromPeerId: options.peerId,
    toPeerId: snapshot.remotePeerId,
    payload: {
      authorizationId,
      probeAck: HOST_SIGNAL_PROBE_ACK_MARKER
    }
  });
  sessionState.hostSignalProbeAckAuthorizationId = authorizationId;
}

function isViewerSignalProbePayload(payload: Record<string, unknown>): boolean {
  return payload.probe === VIEWER_SIGNAL_PROBE_MARKER;
}

function signalPayloadAuthorizationId(
  message: Extract<ProtocolEnvelope, { type: "signal" }>
): string | undefined {
  const value = message.payload.authorizationId;
  return typeof value === "string" ? value : undefined;
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

async function handleHostAuthorizationRequest(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  request: Extract<ProtocolEnvelope, { type: "session-authorization-request" }>,
  sessionState: AgentShellSessionState,
  scheduleTimer: (callback: () => void, delayMs: number) => void
): Promise<void> {
  const decision = await resolveHostDecision(options, request, sessionState);
  if (decision === "none") {
    options.logger?.log("[winbridge-agent] authorization request received; no host decision configured");
    return;
  }

  if (!canSendHostAuthorizationDecision(socket, options, request, sessionState)) {
    return;
  }

  switch (decision) {
    case "deny": {
      const authorizationId = `authz_${randomUUID()}`;
      const auditEvent = prepareDevelopmentAuditEvent(options, {
        action: "agent-shell.authorization.denied",
        outcome: "denied",
        detail: {
          requestedPermissionCount: request.requestedPermissions.length,
          reasonConfigured: Boolean(options.decisionReason)
        }
      });
      setHostAuthorizationSnapshot(sessionState, {
        authorizationId,
        remotePeerId: request.viewerPeerId,
        status: "denied",
        visibleToHost: false,
        permissions: []
      });
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
      sendProtocol(socket, options, auditEvent);
      return;
    }
    case "approve":
      break;
    default:
      throw new Error(HOST_DECISION_ERROR_MESSAGE);
  }

  const grantedPermissions = resolveHostGrantedPermissions(options, request);
  if (!grantedPermissions) {
    return;
  }

  const workflowState: HostWorkflowState = {
    paused: false,
    permissions: [...grantedPermissions]
  };

  const authorizationId = `authz_${randomUUID()}`;
  const grantCreatedAt = new Date();
  const ttlMs = options.authorizationTtlMs ?? 10 * 60_000;
  const expiresAt = new Date(grantCreatedAt.getTime() + ttlMs).toISOString();
  const createGrantMessageBase = () => ({
    ...createMessageBase(options.sessionId),
    createdAt: grantCreatedAt.toISOString()
  });
  const approvalAuditEvent = prepareDevelopmentAuditEvent(options, {
    action: "agent-shell.authorization.approved",
    outcome: "accepted",
    detail: {
      requestedPermissionCount: request.requestedPermissions.length,
      grantedPermissionCount: grantedPermissions.length
    }
  });

  setHostAuthorizationSnapshot(sessionState, {
    authorizationId,
    remotePeerId: request.viewerPeerId,
    status: "approved",
    visibleToHost: false,
    permissions: grantedPermissions,
    expiresAt
  });
  sendProtocol(socket, options, {
    ...createGrantMessageBase(),
    type: "session-authorization-decision",
    authorizationId,
    hostPeerId: options.peerId,
    viewerPeerId: request.viewerPeerId,
    decision: "approved",
    grantedPermissions,
    expiresAt
  });
  sendProtocol(socket, options, approvalAuditEvent);

  if (!options.visibleToHost) {
    options.logger?.log("[winbridge-agent] approval sent; active state withheld because visible session is false");
    return;
  }

  const activeAuditEvent = prepareDevelopmentAuditEvent(options, {
    action: "agent-shell.authorization.active",
    outcome: "accepted",
    detail: {
      grantedPermissionCount: grantedPermissions.length,
      visibleToHost: true
    }
  });
  setHostAuthorizationSnapshot(sessionState, {
    authorizationId,
    remotePeerId: request.viewerPeerId,
    status: "active",
    visibleToHost: true,
    permissions: grantedPermissions,
    expiresAt
  });
  sessionState.hostWorkflowState = workflowState;
  emitHostIndicatorFromAuthorization(options, sessionState, "activated");
  sendProtocol(socket, options, {
    ...createGrantMessageBase(),
    type: "session-authorization-state",
    authorizationId,
    actorPeerId: options.peerId,
    status: "active",
    visibleToHost: true,
    permissions: grantedPermissions,
    expiresAt
  });
  sendProtocol(socket, options, activeAuditEvent);

  scheduleHostExpiration(socket, options, authorizationId, expiresAt, workflowState, sessionState, scheduleTimer);
  scheduleHostRevoke(socket, options, authorizationId, expiresAt, workflowState, sessionState, scheduleTimer);
  scheduleHostTerminate(socket, options, authorizationId, expiresAt, workflowState, sessionState, scheduleTimer);
  scheduleHostPause(socket, options, authorizationId, expiresAt, workflowState, sessionState, scheduleTimer);
  scheduleHostDisconnect(socket, options, expiresAt, workflowState, sessionState, scheduleTimer);
}

function canSendHostAuthorizationDecision(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  request: Extract<ProtocolEnvelope, { type: "session-authorization-request" }>,
  sessionState: AgentShellSessionState
): boolean {
  if (!canSendDelayedHostWorkflow(socket, options, sessionState, "authorization decision")) {
    return false;
  }

  if (
    !sessionState.recipientAvailable ||
    sessionState.observedPeerRole !== "viewer" ||
    sessionState.observedPeerId !== request.viewerPeerId
  ) {
    options.logger?.log("[winbridge-agent] authorization decision skipped because viewer is not connected");
    return false;
  }

  return true;
}

function resolveHostGrantedPermissions(
  options: AgentShellRuntimeOptions,
  request: Extract<ProtocolEnvelope, { type: "session-authorization-request" }>
): Permission[] | undefined {
  if (!options.hostGrantPermissions) {
    return [...request.requestedPermissions];
  }

  if (options.hostGrantPermissions.some((permission) => !request.requestedPermissions.includes(permission))) {
    options.logger?.log("[winbridge-agent] approval skipped because configured grant scope is not requested");
    return undefined;
  }

  return [...options.hostGrantPermissions];
}

async function resolveHostDecision(
  options: AgentShellRuntimeOptions,
  request: Extract<ProtocolEnvelope, { type: "session-authorization-request" }>,
  sessionState: AgentShellSessionState
): Promise<HostDecision> {
  if (!options.hostDecisionProvider) {
    return options.hostDecision ?? "none";
  }

  try {
    const result = await resolveHostDecisionProvider(options, request, sessionState);
    if (result.timedOut) {
      options.logger?.log(
        `[winbridge-agent] interactive host consent timed out timeoutMs=${result.timeoutMs}`
      );
      return "none";
    }

    const decision = result.decision;

    if (decision === "approve" || decision === "deny") {
      return decision;
    }

    options.logger?.log("[winbridge-agent] interactive host consent returned no accepted decision");
    return "none";
  } catch (error) {
    reportRuntimeError(options, error);
    options.logger?.log("[winbridge-agent] interactive host consent failed closed");
    return "none";
  }
}

async function resolveHostDecisionProvider(
  options: AgentShellRuntimeOptions,
  request: Extract<ProtocolEnvelope, { type: "session-authorization-request" }>,
  sessionState: AgentShellSessionState
): Promise<
  | { timedOut: false; decision: HostDecision | null | undefined }
  | { timedOut: true; timeoutMs: number }
> {
  const provider = options.hostDecisionProvider;
  if (!provider) {
    return { timedOut: false, decision: options.hostDecision ?? "none" };
  }

  const timeoutMs = options.hostConsentTimeoutMs ?? DEFAULT_HOST_CONSENT_TIMEOUT_MS;
  const timeoutResult = Symbol("host-consent-timeout");
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const decision = await Promise.race([
      Promise.resolve(
        provider({
          viewerPeerId: request.viewerPeerId,
          viewerDisplayName:
            sessionState.observedPeerId === request.viewerPeerId
              ? sessionState.observedPeerDisplayName
              : undefined,
          requestedPermissions: [...request.requestedPermissions],
          requestedPermissionCount: request.requestedPermissions.length
        })
      ),
      new Promise<typeof timeoutResult>((resolve) => {
        timeout = setTimeout(() => resolve(timeoutResult), timeoutMs);
      })
    ]);

    if (decision === timeoutResult) {
      return { timedOut: true, timeoutMs };
    }

    return { timedOut: false, decision };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function setHostAuthorizationSnapshot(
  sessionState: AgentShellSessionState,
  input: RuntimeAuthorizationSnapshot
): void {
  sessionState.hostAuthorization = {
    ...input,
    remotePeerId: input.remotePeerId ?? sessionState.hostAuthorization?.remotePeerId,
    permissions: [...input.permissions]
  };
}

function emitHostIndicatorFromAuthorization(
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  cause: AgentShellHostIndicatorEvent["cause"]
): void {
  if (options.role !== "host") {
    return;
  }

  const snapshot = sessionState.hostAuthorization;
  if (!snapshot?.visibleToHost) {
    return;
  }

  const state = hostIndicatorStateForAuthorization(snapshot.status);
  emitHostIndicator(options, sessionState, {
    direction: "indicator",
    role: "host",
    state,
    authorizationId: snapshot.authorizationId,
    authorizationStatus: snapshot.status,
    visibleToHost: state !== "inactive",
    permissionCount: state === "inactive" ? 0 : snapshot.permissions.length,
    cause
  });
}

function getHostStatusSnapshot(
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState
): AgentShellHostStatusSnapshot {
  if (options.role !== "host") {
    throw new Error(AGENT_SHELL_HOST_STATUS_ROLE_ERROR_MESSAGE);
  }

  const snapshot = sessionState.hostAuthorization;
  if (!snapshot) {
    return {
      state: "inactive",
      visibleToHost: false,
      permissionCount: 0
    };
  }

  if (sessionState.hostIndicator?.state === "inactive") {
    return {
      state: "inactive",
      authorizationId: sessionState.hostIndicator.authorizationId,
      authorizationStatus: sessionState.hostIndicator.authorizationStatus,
      visibleToHost: false,
      permissionCount: 0,
      inactiveCause: sessionState.hostIndicator.cause
    };
  }

  const state = hostIndicatorStateForAuthorization(snapshot.status);
  return {
    state,
    authorizationId: snapshot.authorizationId,
    authorizationStatus: snapshot.status,
    visibleToHost: state === "inactive" ? false : snapshot.visibleToHost,
    permissionCount: state === "inactive" ? 0 : snapshot.permissions.length
  };
}

function getViewerStatusSnapshot(
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState
): AgentShellViewerStatusSnapshot {
  if (options.role !== "viewer") {
    throw new Error(AGENT_SHELL_VIEWER_STATUS_ROLE_ERROR_MESSAGE);
  }

  const snapshot = sessionState.viewerAuthorization;
  if (!snapshot) {
    return {
      state: "inactive",
      visibleToHost: false,
      permissionCount: 0,
      ...(sessionState.viewerLocalInactiveCause
        ? { localInactiveCause: sessionState.viewerLocalInactiveCause }
        : {})
    };
  }

  if (sessionState.remotePeerDisconnected) {
    const remoteDisconnectReasonCode = sessionState.remoteDisconnectReasonCode;
    return {
      state: "inactive",
      authorizationId: snapshot.authorizationId,
      authorizationStatus: snapshot.status,
      visibleToHost: false,
      permissionCount: 0,
      ...(remoteDisconnectReasonCode ? { remoteDisconnectReasonCode } : {})
    };
  }

  const state = hostIndicatorStateForAuthorization(snapshot.status);
  return {
    state,
    authorizationId: snapshot.authorizationId,
    authorizationStatus: snapshot.status,
    visibleToHost: state === "inactive" ? false : snapshot.visibleToHost,
    permissionCount: state === "inactive" ? 0 : snapshot.permissions.length
  };
}

function deactivateHostIndicator(
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  cause: AgentShellHostIndicatorEvent["cause"]
): void {
  if (options.role !== "host" || !sessionState.hostIndicator || sessionState.hostIndicator.state === "inactive") {
    return;
  }

  const snapshot = sessionState.hostAuthorization;
  emitHostIndicator(options, sessionState, {
    direction: "indicator",
    role: "host",
    state: "inactive",
    authorizationId: snapshot?.authorizationId ?? sessionState.hostIndicator.authorizationId,
    authorizationStatus: snapshot?.status ?? sessionState.hostIndicator.authorizationStatus,
    visibleToHost: false,
    permissionCount: 0,
    cause
  });
}

function emitHostIndicator(
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  event: AgentShellHostIndicatorEvent
): void {
  if (isSameHostIndicator(sessionState.hostIndicator, event)) {
    return;
  }

  sessionState.hostIndicator = event;
  options.onEvent?.(event);
  options.logger?.log(
    `[winbridge-agent] host indicator state=${event.state} authorizationStatus=${event.authorizationStatus} ` +
      `authorizationId=${event.authorizationId} visibleToHost=${event.visibleToHost} ` +
      `permissionCount=${event.permissionCount} cause=${event.cause}`
  );
}

function isSameHostIndicator(
  previous: AgentShellHostIndicatorEvent | undefined,
  next: AgentShellHostIndicatorEvent
): boolean {
  return (
    Boolean(previous) &&
    previous?.state === next.state &&
    previous.authorizationId === next.authorizationId &&
    previous.authorizationStatus === next.authorizationStatus &&
    previous.visibleToHost === next.visibleToHost &&
    previous.permissionCount === next.permissionCount &&
    previous.cause === next.cause
  );
}

function hostIndicatorStateForAuthorization(
  status: SessionAuthorizationStatus
): AgentShellHostIndicatorEvent["state"] {
  if (status === "active") {
    return "active";
  }

  if (status === "paused") {
    return "paused";
  }

  return "inactive";
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

function assertRuntimeHostDecisionProvider(options: AgentShellRuntimeOptions): void {
  if (options.hostDecisionProvider === undefined) {
    return;
  }

  if (
    typeof options.hostDecisionProvider !== "function" ||
    options.role !== "host" ||
    options.hostDecision === "approve" ||
    options.hostDecision === "deny"
  ) {
    throw new Error(HOST_DECISION_PROVIDER_ERROR_MESSAGE);
  }
}

function assertRuntimeHostConsentTimeout(
  value: unknown,
  provider: HostDecisionProvider | undefined
): void {
  if (value === undefined) {
    return;
  }

  if (
    provider === undefined ||
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > MAX_AGENT_SHELL_TIMER_DELAY_MS
  ) {
    throw new Error(HOST_CONSENT_TIMEOUT_ERROR_MESSAGE);
  }
}

function assertRuntimeHostGrantPermissions(options: AgentShellRuntimeOptions): void {
  if (options.hostGrantPermissions === undefined) {
    return;
  }

  if (
    options.role !== "host" ||
    (options.hostDecision !== "approve" && options.hostDecisionProvider === undefined) ||
    !Array.isArray(options.hostGrantPermissions) ||
    options.hostGrantPermissions.length === 0 ||
    options.hostGrantPermissions.length > 16
  ) {
    throw new Error(RUNTIME_HOST_GRANT_SCOPE_ERROR_MESSAGE);
  }

  try {
    for (const permission of options.hostGrantPermissions) {
      PermissionSchema.parse(permission);
    }
  } catch {
    throw new Error(RUNTIME_HOST_GRANT_SCOPE_ERROR_MESSAGE);
  }

  if (new Set(options.hostGrantPermissions).size !== options.hostGrantPermissions.length) {
    throw new Error(RUNTIME_HOST_GRANT_SCOPE_ERROR_MESSAGE);
  }
}

function validateRuntimeOptions(options: AgentShellRuntimeOptions): URL {
  const relayUrl = parseRuntimeRelayUrl(options.relayUrl);

  assertRuntimeRole(options.role);
  assertRuntimeIdentifiers(options);
  assertRuntimeDisplayName(options.displayName);
  assertRuntimeToken(options.token);
  assertRuntimeRequestedPermissions(options.requestedPermissions);
  assertRuntimeHostHasNoViewerRequestOptions(options);
  assertRuntimeRevokePermission(options.hostRevokePermission);
  assertRuntimeVisibleToHost(options.visibleToHost);
  assertValidHostDecision(options.hostDecision);
  assertRuntimeHostDecisionProvider(options);
  assertRuntimeHostConsentTimeout(options.hostConsentTimeoutMs, options.hostDecisionProvider);
  assertRuntimeHostGrantPermissions(options);
  assertRuntimeAuthorizationTtl(options.authorizationTtlMs);
  assertRuntimeWorkflowTimers([
    options.hostRevokeAfterMs,
    options.hostPauseAfterMs,
    options.hostResumeAfterMs,
    options.hostTerminateAfterMs,
    options.hostDisconnectAfterMs,
    options.viewerSignalProbeAfterMs
  ]);
  assertRuntimeViewerSignalProbe(options);
  assertRuntimeHostSignalProbeAck(options);
  assertRuntimeWorkflowReasons([
    options.decisionReason,
    options.hostRevokeReason,
    options.hostPauseReason,
    options.hostResumeReason,
    options.hostTerminateReason,
    options.hostDisconnectReason
  ]);
  assertRuntimeHostDisconnectReason(options);
  assertRuntimeViewerHasNoHostWorkflowOptions(options);

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

  if (relayUrlHasTokenQueryParameter(relayUrl)) {
    throw new Error(RUNTIME_RELAY_URL_ERROR_MESSAGE);
  }

  return relayUrl;
}

function relayUrlHasTokenQueryParameter(relayUrl: URL): boolean {
  for (const [name] of relayUrl.searchParams) {
    if (name.toLowerCase() === "token") {
      return true;
    }
  }

  return false;
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
    value !== value.trim() ||
    Buffer.byteLength(value, "utf8") > MAX_AGENT_SHELL_TOKEN_BYTES ||
    hasAsciiControlCharacter(value) ||
    hasUnsafeFormatCharacter(value)
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

function hasUnsafeFormatCharacter(value: string): boolean {
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

function assertRuntimeHostHasNoViewerRequestOptions(options: AgentShellRuntimeOptions): void {
  if (options.role !== "host") {
    return;
  }

  if (options.requestedPermissions !== undefined && options.requestedPermissions.length > 0) {
    throw new Error(RUNTIME_VIEWER_REQUEST_OPTIONS_ERROR_MESSAGE);
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

function assertRuntimeAuthorizationTtl(value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > MAX_AGENT_SHELL_TIMER_DELAY_MS
  ) {
    throw new Error(RUNTIME_AUTHORIZATION_TTL_ERROR_MESSAGE);
  }
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

function assertRuntimeViewerSignalProbe(options: AgentShellRuntimeOptions): void {
  if (options.viewerSignalProbeAfterMs === undefined) {
    return;
  }

  if (options.role !== "viewer" || !options.requestedPermissions?.includes(SIGNAL_REQUIRED_PERMISSION)) {
    throw new Error(RUNTIME_VIEWER_SIGNAL_PROBE_ERROR_MESSAGE);
  }
}

function assertRuntimeHostSignalProbeAck(options: AgentShellRuntimeOptions): void {
  if (options.hostSignalProbeAck === undefined) {
    return;
  }

  if (typeof options.hostSignalProbeAck !== "boolean" || options.role !== "host") {
    throw new Error(RUNTIME_HOST_SIGNAL_PROBE_ACK_ERROR_MESSAGE);
  }
}

function assertRuntimeViewerHasNoHostWorkflowOptions(options: AgentShellRuntimeOptions): void {
  if (options.role !== "viewer") {
    return;
  }

  if (
    (options.hostDecision !== undefined && options.hostDecision !== "none") ||
    options.visibleToHost === true ||
    options.authorizationTtlMs !== undefined ||
    options.hostRevokeAfterMs !== undefined ||
    options.hostRevokePermission !== undefined ||
    options.hostRevokeReason !== undefined ||
    options.hostPauseAfterMs !== undefined ||
    options.hostPauseReason !== undefined ||
    options.hostResumeAfterMs !== undefined ||
    options.hostResumeReason !== undefined ||
    options.hostTerminateAfterMs !== undefined ||
    options.hostTerminateReason !== undefined ||
    options.hostDisconnectAfterMs !== undefined ||
    options.decisionReason !== undefined
  ) {
    throw new Error(RUNTIME_HOST_WORKFLOW_OPTIONS_ERROR_MESSAGE);
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
      value !== value.trim() ||
      value.length > MAX_AGENT_SHELL_REASON_LENGTH ||
      hasAsciiControlCharacter(value) ||
      hasUnsafeFormatCharacter(value) ||
      hasSecretBearingAuditMetadata(value, { includeKeyAssignments: false })
    ) {
      throw new Error(RUNTIME_WORKFLOW_REASON_ERROR_MESSAGE);
    }
  }
}

function assertRuntimeHostDisconnectReason(options: AgentShellRuntimeOptions): void {
  if (options.hostDisconnectReason === undefined) {
    return;
  }

  if (
    options.role !== "host" ||
    Buffer.byteLength(options.hostDisconnectReason, "utf8") > MAX_AGENT_SHELL_DISCONNECT_REASON_BYTES
  ) {
    throw new Error(RUNTIME_HOST_DISCONNECT_REASON_ERROR_MESSAGE);
  }
}

function scheduleHostRevoke(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
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

  if (!workflowState.permissions.includes(options.hostRevokePermission)) {
    options.logger?.log("[winbridge-agent] revoke permission was not granted in the active grant");
    return;
  }

  const revokedPermission = options.hostRevokePermission;
  const reason = options.hostRevokeReason ?? `Host revoked ${revokedPermission}`;

  scheduleTimer(() => {
    if (!canSendHostRevoke(socket, options, workflowState, sessionState, expiresAt, revokedPermission)) {
      return;
    }

    revokeHostPermission(
      socket,
      options,
      authorizationId,
      expiresAt,
      workflowState,
      sessionState,
      revokedPermission,
      reason
    );
  }, options.hostRevokeAfterMs);
}

function canSendHostRevoke(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  expiresAt: string,
  revokedPermission: Permission
): boolean {
  if (workflowState.terminalStatus) {
    options.logger?.log(`[winbridge-agent] revoke skipped because authorization is ${workflowState.terminalStatus}`);
    return false;
  }

  if (!workflowState.permissions.includes(revokedPermission)) {
    options.logger?.log("[winbridge-agent] revoke skipped because permission is not granted");
    return false;
  }

  if (!canSendDelayedHostWorkflow(socket, options, sessionState, "revoke")) {
    return false;
  }

  if (hasAuthorizationExpired(expiresAt)) {
    options.logger?.log("[winbridge-agent] revoke skipped because authorization is expired");
    return false;
  }

  return true;
}

function revokeHostPermission(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  authorizationId: string,
  expiresAt: string,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  revokedPermission: Permission,
  reason: string
): void {
  const remainingPermissions = workflowState.permissions.filter(
    (permission) => permission !== revokedPermission
  );
  const finalGrantRevoked = remainingPermissions.length === 0;
  const auditEvent = prepareDevelopmentAuditEvent(options, {
    action: "agent-shell.permission.revoked",
    outcome: "accepted",
    detail: {
      revokedPermission,
      remainingPermissionCount: remainingPermissions.length,
      finalGrantRevoked
    }
  });
  workflowState.permissions = remainingPermissions;

  if (finalGrantRevoked) {
    workflowState.terminalStatus = "revoked";
  }

  setHostAuthorizationSnapshot(sessionState, {
    authorizationId,
    status: finalGrantRevoked ? "revoked" : workflowState.paused ? "paused" : "active",
    visibleToHost: true,
    permissions: remainingPermissions,
    expiresAt
  });
  emitHostIndicatorFromAuthorization(
    options,
    sessionState,
    finalGrantRevoked ? "revoked" : "permission-revoked"
  );
  sendProtocol(socket, options, {
    ...createMessageBase(options.sessionId),
    type: "session-control",
    authorizationId,
    actorPeerId: options.peerId,
    action: "revoke-permission",
    permission: revokedPermission,
    reason
  });

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
  sendProtocol(socket, options, auditEvent);
}

function canSendHostPause(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  expiresAt: string
): boolean {
  if (workflowState.terminalStatus) {
    options.logger?.log(`[winbridge-agent] pause skipped because authorization is ${workflowState.terminalStatus}`);
    return false;
  }

  if (workflowState.paused) {
    options.logger?.log("[winbridge-agent] pause skipped because authorization is already paused");
    return false;
  }

  if (!canSendDelayedHostWorkflow(socket, options, sessionState, "pause")) {
    return false;
  }

  if (hasAuthorizationExpired(expiresAt)) {
    options.logger?.log("[winbridge-agent] pause skipped because authorization is expired");
    return false;
  }

  return true;
}

function canSendHostResume(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  expiresAt: string
): boolean {
  if (workflowState.terminalStatus) {
    options.logger?.log(`[winbridge-agent] resume skipped because authorization is ${workflowState.terminalStatus}`);
    return false;
  }

  if (!workflowState.paused) {
    options.logger?.log("[winbridge-agent] resume skipped because authorization is not paused");
    return false;
  }

  if (!canSendDelayedHostWorkflow(socket, options, sessionState, "resume")) {
    return false;
  }

  if (hasAuthorizationExpired(expiresAt)) {
    options.logger?.log("[winbridge-agent] resume skipped because authorization is expired");
    return false;
  }

  return true;
}

function pauseHostAuthorization(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  authorizationId: string,
  expiresAt: string,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  reason: string,
  reasonConfigured: boolean
): void {
  const auditEvent = prepareDevelopmentAuditEvent(options, {
    action: "agent-shell.authorization.paused",
    outcome: "accepted",
    detail: {
      grantedPermissionCount: workflowState.permissions.length,
      visibleToHost: true,
      paused: true,
      reasonConfigured
    }
  });
  workflowState.paused = true;

  setHostAuthorizationSnapshot(sessionState, {
    authorizationId,
    status: "paused",
    visibleToHost: true,
    permissions: workflowState.permissions,
    expiresAt
  });
  emitHostIndicatorFromAuthorization(options, sessionState, "paused");
  sendProtocol(socket, options, {
    ...createMessageBase(options.sessionId),
    type: "session-control",
    authorizationId,
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

  sendProtocol(socket, options, auditEvent);
}

function resumeHostAuthorization(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  authorizationId: string,
  expiresAt: string,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  reason: string,
  reasonConfigured: boolean
): void {
  const auditEvent = prepareDevelopmentAuditEvent(options, {
    action: "agent-shell.authorization.resumed",
    outcome: "accepted",
    detail: {
      grantedPermissionCount: workflowState.permissions.length,
      visibleToHost: true,
      resumed: true,
      reasonConfigured
    }
  });
  workflowState.paused = false;

  sendProtocol(socket, options, {
    ...createMessageBase(options.sessionId),
    type: "session-control",
    authorizationId,
    actorPeerId: options.peerId,
    action: "resume",
    reason
  });

  setHostAuthorizationSnapshot(sessionState, {
    authorizationId,
    status: "active",
    visibleToHost: true,
    permissions: workflowState.permissions,
    expiresAt
  });
  emitHostIndicatorFromAuthorization(options, sessionState, "resumed");
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

  sendProtocol(socket, options, auditEvent);
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
    if (!canSendHostPause(socket, options, workflowState, sessionState, expiresAt)) {
      return;
    }

    pauseHostAuthorization(
      socket,
      options,
      authorizationId,
      expiresAt,
      workflowState,
      sessionState,
      reason,
      Boolean(options.hostPauseReason)
    );
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
    if (!canSendHostResume(socket, options, workflowState, sessionState, expiresAt)) {
      return;
    }

    resumeHostAuthorization(
      socket,
      options,
      authorizationId,
      expiresAt,
      workflowState,
      sessionState,
      reason,
      Boolean(options.hostResumeReason)
    );
  }, options.hostResumeAfterMs);
}

function scheduleHostTerminate(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
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
    if (!canSendHostTerminate(socket, options, workflowState, sessionState, expiresAt)) {
      return;
    }

    terminateHostAuthorization(
      socket,
      options,
      authorizationId,
      expiresAt,
      workflowState,
      sessionState,
      reason,
      Boolean(options.hostTerminateReason)
    );
  }, options.hostTerminateAfterMs);
}

function canSendHostTerminate(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  expiresAt: string
): boolean {
  if (workflowState.terminalStatus) {
    options.logger?.log(`[winbridge-agent] terminate skipped because authorization is ${workflowState.terminalStatus}`);
    return false;
  }

  if (!canSendDelayedHostWorkflow(socket, options, sessionState, "terminate")) {
    return false;
  }

  if (hasAuthorizationExpired(expiresAt)) {
    options.logger?.log("[winbridge-agent] terminate skipped because authorization is expired");
    return false;
  }

  if (!hasLocalHostTerminateAuthorization(sessionState.hostAuthorization)) {
    options.logger?.log("[winbridge-agent] terminate skipped because authorization is not active or paused visible");
    return false;
  }

  return true;
}

function terminateHostAuthorization(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  authorizationId: string,
  expiresAt: string,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  reason: string,
  reasonConfigured: boolean
): void {
  const auditEvent = prepareDevelopmentAuditEvent(options, {
    action: "agent-shell.authorization.terminated",
    outcome: "accepted",
    detail: {
      previouslyGrantedPermissionCount: workflowState.permissions.length,
      visibleToHost: true,
      terminated: true,
      reasonConfigured
    }
  });
  workflowState.terminalStatus = "terminated";
  workflowState.paused = false;
  workflowState.permissions = [];

  setHostAuthorizationSnapshot(sessionState, {
    authorizationId,
    status: "terminated",
    visibleToHost: true,
    permissions: [],
    expiresAt
  });
  emitHostIndicatorFromAuthorization(options, sessionState, "terminated");
  sendProtocol(socket, options, {
    ...createMessageBase(options.sessionId),
    type: "session-control",
    authorizationId,
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

  sendProtocol(socket, options, auditEvent);
}

function scheduleHostExpiration(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  authorizationId: string,
  expiresAt: string,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  scheduleTimer: (callback: () => void, delayMs: number) => void
): void {
  const ttlMs = options.authorizationTtlMs ?? 10 * 60_000;
  const expirationDelayMs = Math.max(0, Date.parse(expiresAt) - Date.now());

  scheduleTimer(() => {
    if (workflowState.terminalStatus) {
      options.logger?.log(`[winbridge-agent] expiration skipped because authorization is ${workflowState.terminalStatus}`);
      return;
    }

    if (!canSendDelayedHostWorkflow(socket, options, sessionState, "expiration")) {
      return;
    }

    const auditEvent = prepareDevelopmentAuditEvent(options, {
      action: "agent-shell.authorization.expired",
      outcome: "accepted",
      detail: {
        previouslyGrantedPermissionCount: workflowState.permissions.length,
        ttlMs,
        visibleToHost: true,
        expired: true
      }
    });
    workflowState.terminalStatus = "expired";

    setHostAuthorizationSnapshot(sessionState, {
      authorizationId,
      status: "expired",
      visibleToHost: true,
      permissions: [],
      expiresAt
    });
    emitHostIndicatorFromAuthorization(options, sessionState, "expired");
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

    sendProtocol(socket, options, auditEvent);
  }, expirationDelayMs);
}

function scheduleHostDisconnect(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  expiresAt: string,
  workflowState: HostWorkflowState,
  sessionState: AgentShellSessionState,
  scheduleTimer: (callback: () => void, delayMs: number) => void
): void {
  if (options.hostDisconnectAfterMs === undefined) {
    return;
  }

  scheduleTimer(() => {
    if (workflowState.terminalStatus) {
      options.logger?.log(`[winbridge-agent] disconnect skipped because authorization is ${workflowState.terminalStatus}`);
      return;
    }

    if (!canSendDelayedHostWorkflow(socket, options, sessionState, "disconnect")) {
      return;
    }

    if (hasAuthorizationExpired(expiresAt)) {
      options.logger?.log("[winbridge-agent] disconnect skipped because authorization is expired");
      return;
    }

    const authorization = sessionState.hostAuthorization;
    if (!hasLocalHostDisconnectAuthorization(authorization)) {
      options.logger?.log("[winbridge-agent] disconnect skipped because authorization is not active visible");
      return;
    }

    closeLocalHostConnection(
      socket,
      options,
      sessionState,
      authorization,
      options.hostDisconnectReason ?? "Host disconnect simulation",
      "disconnect simulation closing local relay connection"
    );
  }, options.hostDisconnectAfterMs);
}

function getLocalHostRevokeControl(
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  revokedPermission: Permission
): LocalHostWorkflowControl {
  if (options.role !== "host") {
    throw new Error(AGENT_SHELL_REVOKE_ROLE_ERROR_MESSAGE);
  }

  const authorization = sessionState.hostAuthorization;
  const workflowState = sessionState.hostWorkflowState;
  if (!workflowState || workflowState.terminalStatus || !hasLocalHostRevokeAuthorization(authorization)) {
    throw new Error(AGENT_SHELL_REVOKE_AUTHORIZATION_ERROR_MESSAGE);
  }

  if (
    !workflowState.permissions.includes(revokedPermission) ||
    !authorization.permissions.includes(revokedPermission)
  ) {
    throw new Error(AGENT_SHELL_REVOKE_PERMISSION_ERROR_MESSAGE);
  }

  return { authorization, workflowState };
}

function hasLocalHostRevokeAuthorization(
  snapshot: RuntimeAuthorizationSnapshot | undefined
): snapshot is VisibleRuntimeAuthorizationSnapshot {
  return Boolean(
    snapshot &&
      snapshot.visibleToHost &&
      (snapshot.status === "active" || snapshot.status === "paused") &&
      snapshot.expiresAt &&
      !hasAuthorizationExpired(snapshot.expiresAt)
  );
}

function getLocalHostPauseControl(
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState
): LocalHostWorkflowControl {
  if (options.role !== "host") {
    throw new Error(AGENT_SHELL_PAUSE_ROLE_ERROR_MESSAGE);
  }

  const authorization = sessionState.hostAuthorization;
  const workflowState = sessionState.hostWorkflowState;
  if (
    !workflowState ||
    workflowState.terminalStatus ||
    workflowState.paused ||
    !hasLocalHostPauseAuthorization(authorization)
  ) {
    throw new Error(AGENT_SHELL_PAUSE_AUTHORIZATION_ERROR_MESSAGE);
  }

  return { authorization, workflowState };
}

function getLocalHostResumeControl(
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState
): LocalHostWorkflowControl {
  if (options.role !== "host") {
    throw new Error(AGENT_SHELL_RESUME_ROLE_ERROR_MESSAGE);
  }

  const authorization = sessionState.hostAuthorization;
  const workflowState = sessionState.hostWorkflowState;
  if (
    !workflowState ||
    workflowState.terminalStatus ||
    !workflowState.paused ||
    !hasLocalHostResumeAuthorization(authorization)
  ) {
    throw new Error(AGENT_SHELL_RESUME_AUTHORIZATION_ERROR_MESSAGE);
  }

  return { authorization, workflowState };
}

function getLocalHostTerminateControl(
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState
): LocalHostWorkflowControl {
  if (options.role !== "host") {
    throw new Error(AGENT_SHELL_TERMINATE_ROLE_ERROR_MESSAGE);
  }

  const authorization = sessionState.hostAuthorization;
  const workflowState = sessionState.hostWorkflowState;
  if (!workflowState || workflowState.terminalStatus || !hasLocalHostTerminateAuthorization(authorization)) {
    throw new Error(AGENT_SHELL_TERMINATE_AUTHORIZATION_ERROR_MESSAGE);
  }

  return { authorization, workflowState };
}

function hasLocalHostPauseAuthorization(
  snapshot: RuntimeAuthorizationSnapshot | undefined
): snapshot is VisibleRuntimeAuthorizationSnapshot {
  return Boolean(
    snapshot &&
      snapshot.visibleToHost &&
      snapshot.status === "active" &&
      snapshot.expiresAt &&
      !hasAuthorizationExpired(snapshot.expiresAt)
  );
}

function hasLocalHostResumeAuthorization(
  snapshot: RuntimeAuthorizationSnapshot | undefined
): snapshot is VisibleRuntimeAuthorizationSnapshot {
  return Boolean(
    snapshot &&
      snapshot.visibleToHost &&
      snapshot.status === "paused" &&
      snapshot.expiresAt &&
      !hasAuthorizationExpired(snapshot.expiresAt)
  );
}

function hasLocalHostTerminateAuthorization(
  snapshot: RuntimeAuthorizationSnapshot | undefined
): snapshot is VisibleRuntimeAuthorizationSnapshot {
  return Boolean(
    snapshot &&
      snapshot.visibleToHost &&
      (snapshot.status === "active" || snapshot.status === "paused") &&
      snapshot.expiresAt &&
      !hasAuthorizationExpired(snapshot.expiresAt)
  );
}

function getLocalHostDisconnectAuthorization(
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState
): VisibleRuntimeAuthorizationSnapshot {
  if (options.role !== "host") {
    throw new Error(AGENT_SHELL_LOCAL_DISCONNECT_ROLE_ERROR_MESSAGE);
  }

  const authorization = sessionState.hostAuthorization;
  if (!hasLocalHostDisconnectAuthorization(authorization)) {
    throw new Error(AGENT_SHELL_LOCAL_DISCONNECT_AUTHORIZATION_ERROR_MESSAGE);
  }

  return authorization;
}

function hasLocalHostDisconnectAuthorization(
  snapshot: RuntimeAuthorizationSnapshot | undefined
): snapshot is VisibleRuntimeAuthorizationSnapshot {
  return Boolean(
    snapshot &&
      snapshot.visibleToHost &&
      (snapshot.status === "active" || snapshot.status === "paused") &&
      snapshot.expiresAt &&
      !hasAuthorizationExpired(snapshot.expiresAt)
  );
}

function assertLocalRuntimeSocketOpen(socket: WebSocket): void {
  if (socket.readyState !== WebSocket.OPEN) {
    throw new Error(AGENT_SHELL_LOCAL_PEER_DISCONNECTED_ERROR_MESSAGE);
  }
}

function closeLocalHostConnection(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  authorization: RuntimeAuthorizationSnapshot,
  closeReason: string,
  logMessage: string
): void {
  persistLocalHostDisconnectAudit(options, authorization);
  sessionState.localPeerDisconnected = true;
  deactivateHostIndicator(options, sessionState, "local-disconnect");
  options.logger?.log(`[winbridge-agent] ${logMessage}`);
  socket?.close(1000, closeReason);
}

function persistLocalHostDisconnectAudit(
  options: AgentShellRuntimeOptions,
  snapshot: RuntimeAuthorizationSnapshot
): void {
  try {
    writeDevelopmentAuditRecord(options, {
      action: "agent-shell.session.disconnected",
      outcome: "accepted",
      detail: {
        authorizationId: snapshot.authorizationId,
        authorizationStatus: snapshot.status,
        cause: "local-disconnect",
        visibleToHost: snapshot.visibleToHost,
        permissionCount: snapshot.permissions.length
      }
    });
  } catch (error) {
    reportRuntimeError(options, error);
  }
}

function canSendDelayedHostWorkflow(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  sessionState: AgentShellSessionState,
  action: string
): boolean {
  if (sessionState.localPeerDisconnected) {
    options.logger?.log(`[winbridge-agent] ${action} skipped because local peer disconnected`);
    return false;
  }

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

function prepareDevelopmentAuditEvent(
  options: AgentShellRuntimeOptions,
  input: DevelopmentAuditInput
): DevelopmentAuditEvent {
  const eventId = writeDevelopmentAuditRecord(options, input);

  return {
    ...createMessageBase(options.sessionId),
    type: "audit-event",
    eventId,
    actorPeerId: options.peerId,
    action: input.action,
    outcome: input.outcome,
    detail: input.detail
  };
}

function writeDevelopmentAuditRecord(
  options: AgentShellRuntimeOptions,
  input: DevelopmentAuditInput
): string {
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

  return eventId;
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
      byteLength: Buffer.byteLength(stringifyJson(message.payload), "utf8")
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

  const permissions = raw.split(",").map((permission) => PermissionSchema.parse(permission));

  if (new Set(permissions).size !== permissions.length) {
    throw new Error("Requested permissions must be unique");
  }

  return permissions;
}
