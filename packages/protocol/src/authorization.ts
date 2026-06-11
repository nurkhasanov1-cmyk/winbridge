import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PermissionSchema, type Permission } from "./session.js";

export const SessionAuthorizationStatusSchema = z.enum([
  "pending",
  "denied",
  "approved",
  "active",
  "paused",
  "revoked",
  "terminated",
  "expired"
]);
export type SessionAuthorizationStatus = z.infer<typeof SessionAuthorizationStatusSchema>;

export const SessionAuthorizationSchema = z.object({
  authorizationId: z.string().min(8),
  sessionId: z.string().min(3),
  hostPeerId: z.string().min(3),
  viewerPeerId: z.string().min(3),
  status: SessionAuthorizationStatusSchema,
  permissions: z.array(PermissionSchema).max(16),
  visibleToHost: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  approvedAt: z.string().datetime().optional(),
  activatedAt: z.string().datetime().optional(),
  pausedAt: z.string().datetime().optional(),
  resumedAt: z.string().datetime().optional(),
  revokedAt: z.string().datetime().optional(),
  terminatedAt: z.string().datetime().optional(),
  reason: z.string().min(1).max(240).optional()
});
export type SessionAuthorization = z.infer<typeof SessionAuthorizationSchema>;

export function createPendingSessionAuthorization(input: {
  sessionId: string;
  hostPeerId: string;
  viewerPeerId: string;
  requestedPermissions: Permission[];
  ttlMs?: number;
  now?: Date;
  authorizationId?: string;
}): SessionAuthorization {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? 30 * 60_000;

  return SessionAuthorizationSchema.parse({
    authorizationId: input.authorizationId ?? `authz_${randomUUID()}`,
    sessionId: input.sessionId,
    hostPeerId: input.hostPeerId,
    viewerPeerId: input.viewerPeerId,
    status: "pending",
    permissions: input.requestedPermissions,
    visibleToHost: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString()
  });
}

export function approveSessionAuthorization(
  authorization: SessionAuthorization,
  input: {
    grantedPermissions: Permission[];
    now?: Date;
  }
): SessionAuthorization {
  const now = input.now ?? new Date();
  const parsed = assertMutablePending(authorization, now);

  return SessionAuthorizationSchema.parse({
    ...parsed,
    status: "approved",
    permissions: input.grantedPermissions,
    approvedAt: now.toISOString(),
    updatedAt: now.toISOString()
  });
}

export function denySessionAuthorization(
  authorization: SessionAuthorization,
  input: {
    reason: string;
    now?: Date;
  }
): SessionAuthorization {
  const now = input.now ?? new Date();
  const parsed = assertMutablePending(authorization, now);

  return SessionAuthorizationSchema.parse({
    ...parsed,
    status: "denied",
    reason: input.reason,
    updatedAt: now.toISOString()
  });
}

export function activateSessionAuthorization(
  authorization: SessionAuthorization,
  input: {
    visibleToHost: true;
    now?: Date;
  }
): SessionAuthorization {
  const parsed = SessionAuthorizationSchema.parse(authorization);

  if (parsed.status !== "approved") {
    throw new Error(`Cannot activate session authorization from ${parsed.status} state`);
  }

  if (!input.visibleToHost) {
    throw new Error("Cannot activate session authorization without visible host session");
  }

  const now = input.now ?? new Date();
  assertNotExpired(parsed, now);

  return SessionAuthorizationSchema.parse({
    ...parsed,
    status: "active",
    visibleToHost: true,
    activatedAt: now.toISOString(),
    updatedAt: now.toISOString()
  });
}

export function revokeSessionPermission(
  authorization: SessionAuthorization,
  input: {
    permission: Permission;
    now?: Date;
    reason?: string;
  }
): SessionAuthorization {
  const parsed = SessionAuthorizationSchema.parse(authorization);
  const now = input.now ?? new Date();
  const permission = PermissionSchema.parse(input.permission);

  if (parsed.status !== "active" && parsed.status !== "paused") {
    throw new Error(`Cannot revoke permission from ${parsed.status} state`);
  }

  if (!parsed.visibleToHost) {
    throw new Error("Cannot revoke permission without visible host session");
  }

  assertNotExpired(parsed, now);

  if (!parsed.permissions.includes(permission)) {
    throw new Error("Session authorization does not include revoked permission");
  }

  const remainingPermissions = parsed.permissions.filter((existing) => existing !== permission);

  return SessionAuthorizationSchema.parse({
    ...parsed,
    status: remainingPermissions.length === 0 ? "revoked" : parsed.status,
    permissions: remainingPermissions,
    revokedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    reason: input.reason ?? `Permission revoked: ${permission}`
  });
}

export function pauseSessionAuthorization(
  authorization: SessionAuthorization,
  input: {
    reason?: string;
    now?: Date;
  } = {}
): SessionAuthorization {
  const parsed = SessionAuthorizationSchema.parse(authorization);

  if (parsed.status !== "active") {
    throw new Error(`Cannot pause session authorization from ${parsed.status} state`);
  }

  if (!parsed.visibleToHost) {
    throw new Error("Cannot pause session authorization without visible host session");
  }

  const now = input.now ?? new Date();
  assertNotExpired(parsed, now);

  return SessionAuthorizationSchema.parse({
    ...parsed,
    status: "paused",
    pausedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    reason: input.reason ?? "Host paused session"
  });
}

export function resumeSessionAuthorization(
  authorization: SessionAuthorization,
  input: {
    reason?: string;
    now?: Date;
  } = {}
): SessionAuthorization {
  const parsed = SessionAuthorizationSchema.parse(authorization);

  if (parsed.status !== "paused") {
    throw new Error(`Cannot resume session authorization from ${parsed.status} state`);
  }

  if (!parsed.visibleToHost) {
    throw new Error("Cannot resume session authorization without visible host session");
  }

  const now = input.now ?? new Date();
  assertNotExpired(parsed, now);

  return SessionAuthorizationSchema.parse({
    ...parsed,
    status: "active",
    resumedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    reason: input.reason ?? "Host resumed session"
  });
}

export function terminateSessionAuthorization(
  authorization: SessionAuthorization,
  input: {
    reason: string;
    now?: Date;
  }
): SessionAuthorization {
  const parsed = SessionAuthorizationSchema.parse(authorization);
  const now = input.now ?? new Date();

  return SessionAuthorizationSchema.parse({
    ...parsed,
    status: "terminated",
    terminatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    reason: input.reason
  });
}

export function expireSessionAuthorization(
  authorization: SessionAuthorization,
  now = new Date()
): SessionAuthorization {
  const parsed = SessionAuthorizationSchema.parse(authorization);

  if (!isSessionAuthorizationExpired(parsed, now)) {
    return parsed;
  }

  return SessionAuthorizationSchema.parse({
    ...parsed,
    status: "expired",
    updatedAt: now.toISOString(),
    reason: "Authorization expired"
  });
}

export function isSessionAuthorizationExpired(
  authorization: SessionAuthorization,
  now = new Date()
): boolean {
  return Date.parse(authorization.expiresAt) <= now.getTime();
}

export function assertSessionActionAuthorized(input: {
  authorization: unknown;
  permission: Permission;
  now?: Date;
}): SessionAuthorization {
  const authorization = expireSessionAuthorization(
    SessionAuthorizationSchema.parse(input.authorization),
    input.now ?? new Date()
  );
  const permission = PermissionSchema.parse(input.permission);

  if (authorization.status !== "active") {
    throw new Error(`Session authorization is not active: ${authorization.status}`);
  }

  if (!authorization.visibleToHost) {
    throw new Error("Session authorization is not visible to host");
  }

  if (!authorization.permissions.includes(permission)) {
    throw new Error("Session authorization does not include requested permission");
  }

  return authorization;
}

function assertMutablePending(authorization: SessionAuthorization, now = new Date()): SessionAuthorization {
  const parsed = SessionAuthorizationSchema.parse(authorization);

  if (parsed.status !== "pending") {
    throw new Error(`Expected pending session authorization, got ${parsed.status}`);
  }

  assertNotExpired(parsed, now);
  return parsed;
}

function assertNotExpired(authorization: SessionAuthorization, now = new Date()): void {
  if (isSessionAuthorizationExpired(authorization, now)) {
    throw new Error("Session authorization is expired");
  }
}
