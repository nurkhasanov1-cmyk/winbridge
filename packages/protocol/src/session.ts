import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";

export const SessionRoleSchema = z.enum(["host", "viewer"]);
export type SessionRole = z.infer<typeof SessionRoleSchema>;

export const PROTOCOL_IDENTIFIER_MAX_LENGTH = 128;
const PROTOCOL_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export const ProtocolIdentifierSchema = z
  .string()
  .min(3)
  .max(PROTOCOL_IDENTIFIER_MAX_LENGTH)
  .regex(
    PROTOCOL_IDENTIFIER_PATTERN,
    "Protocol identifier must start with a letter or number and contain only letters, numbers, dot, underscore, colon, or hyphen"
  );
export const SessionIdSchema = ProtocolIdentifierSchema;
export const PeerIdSchema = ProtocolIdentifierSchema;

const BasePermissionSchema = z.enum([
  "screen:view",
  "input:pointer",
  "input:keyboard",
  "clipboard:read",
  "clipboard:write",
  "file-transfer"
]);
export type Permission = z.infer<typeof BasePermissionSchema>;

const UNAVAILABLE_PERMISSIONS: ReadonlySet<Permission> = new Set([
  "clipboard:read",
  "clipboard:write"
]);

export const PermissionSchema = BasePermissionSchema.refine(
  (permission) => !UNAVAILABLE_PERMISSIONS.has(permission),
  "Permission requires an explicit capability review"
);

const SessionGrantPermissionsSchema = z
  .array(PermissionSchema)
  .min(1, "Session grant requires at least one permission")
  .max(16)
  .superRefine((permissions, context) => {
    if (new Set(permissions).size === permissions.length) {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Session grant permissions must be unique"
    });
  });

export const SessionGrantSchema = z.object({
  sessionId: SessionIdSchema,
  hostPeerId: PeerIdSchema,
  viewerPeerId: PeerIdSchema,
  permissions: SessionGrantPermissionsSchema,
  requiresHostApproval: z.literal(true),
  visibleSessionRequired: z.literal(true),
  expiresAt: z.string().datetime(),
  auditId: ProtocolIdentifierSchema
}).strict();
export type SessionGrant = z.infer<typeof SessionGrantSchema>;

export const PairingCodeSchema = z.string().regex(/^\d{3}-\d{3}$/);

export function createPairingCode(): string {
  const left = randomInt(0, 1000).toString().padStart(3, "0");
  const right = randomInt(0, 1000).toString().padStart(3, "0");
  return `${left}-${right}`;
}

export function createAuditId(): string {
  return `audit_${randomUUID()}`;
}

export function isGrantExpired(grant: SessionGrant, now = new Date()): boolean {
  return Date.parse(grant.expiresAt) <= now.getTime();
}

export function assertConsentBoundGrant(grant: SessionGrant, now = new Date()): SessionGrant {
  const parsed = SessionGrantSchema.parse(grant);

  if (isGrantExpired(parsed, now)) {
    throw new Error("Session grant is expired");
  }

  return parsed;
}
