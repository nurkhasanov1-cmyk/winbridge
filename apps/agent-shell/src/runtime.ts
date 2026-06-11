import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import type { AuditSink } from "@winbridge/audit-log";
import {
  createDeviceIdentity,
  createMessageBase,
  decodeProtocolEnvelope,
  encodeProtocolEnvelope,
  PairingCodeSchema,
  PermissionSchema,
  type AuditOutcome,
  type Permission,
  type ProtocolEnvelope,
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
  | { direction: "sent"; message: ProtocolEnvelope }
  | { direction: "received"; message: ProtocolEnvelope }
  | { direction: "raw"; text: string }
  | { direction: "error"; error: Error }
  | { direction: "closed"; code: number; reason: string };

export type AgentShellRuntime = {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: ProtocolEnvelope): void;
};

type HostWorkflowState = {
  terminalStatus?: "revoked" | "terminated" | "expired";
  paused: boolean;
  permissions: Permission[];
};

export function createAgentShellRuntime(options: AgentShellRuntimeOptions): AgentShellRuntime {
  const logger = options.logger ?? console;
  const relayUrl = new URL(options.relayUrl);
  let socket: WebSocket | undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();

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
        handleMessage(data.toString(), socket, options, scheduleTimer);
      });

      socket.on("close", (code, reason) => {
        const event = { direction: "closed", code, reason: reason.toString() } as const;
        options.onEvent?.(event);
        logger.log(`[winbridge-agent] disconnected code=${code} reasonBytes=${reason.length}`);
      });

      socket.on("error", (error) => {
        logger.error(`[winbridge-agent] socket error ${error.message}`);
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

          sendProtocol(socket, options, {
            ...createMessageBase(options.sessionId),
            type: "hello",
            peerId: options.peerId,
            role: options.role,
            displayName: options.displayName,
            capabilities: ["session:visible", "consent:required", "audit:stdout"]
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

      sendProtocol(socket, options, message);
    }
  };
}

function handleMessage(
  text: string,
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  scheduleTimer: (callback: () => void, delayMs: number) => void
): void {
  let envelope: ProtocolEnvelope;

  try {
    envelope = decodeProtocolEnvelope(text);
  } catch {
    options.onEvent?.({ direction: "raw", text });
    options.logger?.log(`[winbridge-agent] received non-protocol message bytes=${Buffer.byteLength(text)}`);
    return;
  }

  options.onEvent?.({ direction: "received", message: envelope });
  options.logger?.log(`[winbridge-agent] ${summarizeProtocolMessage(envelope)}`);

  try {
    if (envelope.type === "relay-ready" && options.role === "viewer") {
      sendViewerAuthorizationRequest(socket, options);
    }

    if (envelope.type === "session-authorization-request" && options.role === "host") {
      handleHostAuthorizationRequest(socket, options, envelope, scheduleTimer);
    }
  } catch (error) {
    reportRuntimeError(options, error);
  }
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
  scheduleTimer: (callback: () => void, delayMs: number) => void
): void {
  const decision = options.hostDecision ?? "none";
  const workflowState: HostWorkflowState = {
    paused: false,
    permissions: [...request.requestedPermissions]
  };

  if (decision === "none") {
    options.logger?.log("[winbridge-agent] authorization request received; no host decision configured");
    return;
  }

  const authorizationId = `authz_${randomUUID()}`;

  if (decision === "deny") {
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

  scheduleHostRevoke(socket, options, request, authorizationId, expiresAt, workflowState, scheduleTimer);
  scheduleHostTerminate(socket, options, request, authorizationId, expiresAt, workflowState, scheduleTimer);
  scheduleHostPause(socket, options, authorizationId, expiresAt, workflowState, scheduleTimer);
  scheduleHostExpiration(socket, options, request, authorizationId, expiresAt, workflowState, scheduleTimer);
}

function scheduleHostRevoke(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  request: Extract<ProtocolEnvelope, { type: "session-authorization-request" }>,
  authorizationId: string,
  expiresAt: string,
  workflowState: HostWorkflowState,
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

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      options.logger?.log("[winbridge-agent] revoke skipped because socket is closed");
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

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      options.logger?.log("[winbridge-agent] pause skipped because socket is closed");
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

    scheduleHostResume(socket, options, authorizationId, expiresAt, workflowState, scheduleTimer);
  }, options.hostPauseAfterMs);
}

function scheduleHostResume(
  socket: WebSocket | undefined,
  options: AgentShellRuntimeOptions,
  authorizationId: string,
  expiresAt: string,
  workflowState: HostWorkflowState,
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

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      options.logger?.log("[winbridge-agent] resume skipped because socket is closed");
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

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      options.logger?.log("[winbridge-agent] terminate skipped because socket is closed");
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
  scheduleTimer: (callback: () => void, delayMs: number) => void
): void {
  const ttlMs = options.authorizationTtlMs ?? 10 * 60_000;

  scheduleTimer(() => {
    if (workflowState.terminalStatus) {
      options.logger?.log(`[winbridge-agent] expiration skipped because authorization is ${workflowState.terminalStatus}`);
      return;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      options.logger?.log("[winbridge-agent] expiration skipped because socket is closed");
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

function reportRuntimeError(options: AgentShellRuntimeOptions, error: unknown): void {
  const runtimeError = error instanceof Error ? error : new Error("Agent shell runtime error");
  options.onEvent?.({ direction: "error", error: runtimeError });
  options.logger?.error(`[winbridge-agent] runtime error ${runtimeError.message}`);
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

  socket.send(encodeProtocolEnvelope(message));
  options.onEvent?.({ direction: "sent", message });
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

  return raw
    .split(",")
    .map((permission) => PermissionSchema.parse(permission.trim()))
    .filter((permission, index, permissions) => permissions.indexOf(permission) === index);
}
