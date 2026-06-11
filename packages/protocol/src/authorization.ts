import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PeerIdSchema, PermissionSchema, type Permission, ProtocolIdentifierSchema, SessionIdSchema } from "./session.js";

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

const grantBearingStatuses = new Set<SessionAuthorizationStatus>(["pending", "approved", "active", "paused"]);
const terminalStatuses = new Set<SessionAuthorizationStatus>(["denied", "revoked", "terminated", "expired"]);
const DEFAULT_AUTHORIZATION_TTL_MS = 30 * 60_000;
const MAX_AUTHORIZATION_TTL_MS = 2_147_483_647;
const AuthorizationReasonSchema = z
  .string()
  .min(1)
  .max(240)
  .refine((reason) => reason.trim().length > 0, "Authorization reason must not be blank");

const SessionAuthorizationBaseSchema = z.object({
  authorizationId: ProtocolIdentifierSchema.min(8),
  sessionId: SessionIdSchema,
  hostPeerId: PeerIdSchema,
  viewerPeerId: PeerIdSchema,
  status: SessionAuthorizationStatusSchema,
  permissions: z.array(PermissionSchema).max(16),
  visibleToHost: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  deniedAt: z.string().datetime().optional(),
  approvedAt: z.string().datetime().optional(),
  activatedAt: z.string().datetime().optional(),
  pausedAt: z.string().datetime().optional(),
  resumedAt: z.string().datetime().optional(),
  revokedAt: z.string().datetime().optional(),
  terminatedAt: z.string().datetime().optional(),
  expiredAt: z.string().datetime().optional(),
  reason: AuthorizationReasonSchema.optional()
});
export const SessionAuthorizationSchema = SessionAuthorizationBaseSchema.superRefine((authorization, ctx) => {
  if (new Set(authorization.permissions).size !== authorization.permissions.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Session authorization permissions must be unique",
      path: ["permissions"]
    });
  }

  if (grantBearingStatuses.has(authorization.status) && authorization.permissions.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${authorization.status} session authorization requires at least one permission`,
      path: ["permissions"]
    });
  }

  if (terminalStatuses.has(authorization.status) && authorization.permissions.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${authorization.status} session authorization cannot carry permissions`,
      path: ["permissions"]
    });
  }

  if ((authorization.status === "active" || authorization.status === "paused") && !authorization.visibleToHost) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${authorization.status} session authorization must be visible to host`,
      path: ["visibleToHost"]
    });
  }

  requireLifecycleTimestamp(authorization.status, "denied", authorization.deniedAt, "deniedAt", ctx);
  requireLifecycleTimestamp(authorization.status, "approved", authorization.approvedAt, "approvedAt", ctx);
  requireLifecycleTimestamp(authorization.status, "active", authorization.approvedAt, "approvedAt", ctx);
  requireLifecycleTimestamp(authorization.status, "active", authorization.activatedAt, "activatedAt", ctx);
  requireLifecycleTimestamp(authorization.status, "paused", authorization.approvedAt, "approvedAt", ctx);
  requireLifecycleTimestamp(authorization.status, "paused", authorization.activatedAt, "activatedAt", ctx);
  requireLifecycleTimestamp(authorization.status, "paused", authorization.pausedAt, "pausedAt", ctx);
  requireLifecycleTimestamp(authorization.status, "revoked", authorization.revokedAt, "revokedAt", ctx);
  requireLifecycleTimestamp(authorization.status, "terminated", authorization.terminatedAt, "terminatedAt", ctx);
  requireLifecycleTimestamp(authorization.status, "expired", authorization.expiredAt, "expiredAt", ctx);

  if (authorization.status === "active" && authorization.pausedAt && !authorization.resumedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "active session authorization with prior pause requires resumedAt",
      path: ["resumedAt"]
    });
  }

  if (authorization.resumedAt && !authorization.pausedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "session authorization resumedAt requires pausedAt",
      path: ["pausedAt"]
    });
  }
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
  const ttlMs = input.ttlMs ?? DEFAULT_AUTHORIZATION_TTL_MS;
  assertSafeAuthorizationTtl(ttlMs);
  const requestedPermissions = parseUniquePermissions(input.requestedPermissions, {
    allowEmpty: false,
    duplicateMessage: "Requested permissions must be unique",
    emptyMessage: "Session authorization requires at least one requested permission"
  });

  return SessionAuthorizationSchema.parse({
    authorizationId: input.authorizationId ?? `authz_${randomUUID()}`,
    sessionId: input.sessionId,
    hostPeerId: input.hostPeerId,
    viewerPeerId: input.viewerPeerId,
    status: "pending",
    permissions: requestedPermissions,
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
  const grantedPermissions = parseUniquePermissions(input.grantedPermissions, {
    allowEmpty: false,
    duplicateMessage: "Granted permissions must be unique",
    emptyMessage: "Session authorization approval requires at least one granted permission"
  });

  for (const permission of grantedPermissions) {
    if (!parsed.permissions.includes(permission)) {
      throw new Error(`Granted permission was not requested: ${permission}`);
    }
  }

  return SessionAuthorizationSchema.parse({
    ...parsed,
    status: "approved",
    permissions: grantedPermissions,
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
    permissions: [],
    reason: input.reason,
    deniedAt: now.toISOString(),
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
    permissions: [],
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
    permissions: [],
    expiredAt: now.toISOString(),
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

function assertSafeAuthorizationTtl(ttlMs: number): void {
  if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > MAX_AUTHORIZATION_TTL_MS) {
    throw new Error(`Authorization TTL must be an integer from 1 through ${MAX_AUTHORIZATION_TTL_MS}`);
  }
}

function parseUniquePermissions(
  permissions: Permission[],
  messages: {
    allowEmpty: boolean;
    duplicateMessage: string;
    emptyMessage: string;
  }
): Permission[] {
  const parsed = z.array(PermissionSchema).max(16).parse(permissions);

  if (!messages.allowEmpty && parsed.length === 0) {
    throw new Error(messages.emptyMessage);
  }

  if (new Set(parsed).size !== parsed.length) {
    throw new Error(messages.duplicateMessage);
  }

  return parsed;
}

function requireLifecycleTimestamp(
  actualStatus: SessionAuthorizationStatus,
  requiredStatus: SessionAuthorizationStatus,
  value: string | undefined,
  field: string,
  ctx: z.RefinementCtx
): void {
  if (actualStatus !== requiredStatus || value) {
    return;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `${actualStatus} session authorization requires ${field}`,
    path: [field]
  });
}
