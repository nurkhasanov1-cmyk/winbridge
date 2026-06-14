import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { hasSecretBearingProtocolIdentifierMetadata } from "./identifier-metadata.js";
import { deepFreeze } from "./immutable-snapshot.js";

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
const SessionGrantIdentifierSchema = ProtocolIdentifierSchema.refine(
  (identifier) => !hasSecretBearingProtocolIdentifierMetadata(identifier),
  "Session grant identifier must not contain sensitive metadata"
);

const BasePermissionSchema = z.enum([
  "screen:view",
  "input:pointer",
  "input:keyboard",
  "clipboard:read",
  "clipboard:write",
  "file-transfer"
]);
export type Permission = z.infer<typeof BasePermissionSchema>;

const KNOWN_PERMISSIONS: ReadonlySet<Permission> = new Set(BasePermissionSchema.options);
const UNAVAILABLE_PERMISSIONS: ReadonlySet<Permission> = new Set([
  "clipboard:read",
  "clipboard:write",
  "file-transfer"
]);

export const PermissionSchema = z
  .string()
  .superRefine((permission, context) => {
    if (!isKnownPermission(permission)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Permission is not supported"
      });
      return;
    }

    if (UNAVAILABLE_PERMISSIONS.has(permission)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Permission requires an explicit capability review"
      });
    }
  })
  .transform((permission): Permission => permission as Permission);

export const MAX_PERMISSION_COUNT = 16;
const BasePermissionListSchema = z.array(PermissionSchema).max(MAX_PERMISSION_COUNT);

type PermissionListValidationOptions = {
  allowEmpty?: boolean;
  duplicateMessage: string;
  emptyMessage?: string;
};

export function createPermissionListSchema(options: PermissionListValidationOptions) {
  return BasePermissionListSchema.superRefine((permissions, context) => {
    const issue = getPermissionListIssue(permissions, options);
    if (!issue) {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: issue
    });
  });
}

export function parsePermissionList(input: unknown, options: PermissionListValidationOptions): Permission[] {
  const parsed = BasePermissionListSchema.parse(input);
  const issue = getPermissionListIssue(parsed, options);
  if (issue) {
    throw new Error(issue);
  }

  return parsed;
}

function getPermissionListIssue(
  permissions: readonly Permission[],
  options: PermissionListValidationOptions
): string | undefined {
  if (options.allowEmpty === false && permissions.length === 0) {
    return options.emptyMessage ?? "Permission list requires at least one permission";
  }

  if (new Set(permissions).size !== permissions.length) {
    return options.duplicateMessage;
  }

  return undefined;
}

function isKnownPermission(permission: string): permission is Permission {
  return KNOWN_PERMISSIONS.has(permission as Permission);
}

const SessionGrantPermissionsSchema = createPermissionListSchema({
  allowEmpty: false,
  duplicateMessage: "Session grant permissions must be unique",
  emptyMessage: "Session grant requires at least one permission"
});

export const SessionGrantSchema = z.object({
  sessionId: SessionGrantIdentifierSchema,
  hostPeerId: SessionGrantIdentifierSchema,
  viewerPeerId: SessionGrantIdentifierSchema,
  permissions: SessionGrantPermissionsSchema,
  requiresHostApproval: z.literal(true),
  visibleSessionRequired: z.literal(true),
  expiresAt: z.string().datetime(),
  auditId: SessionGrantIdentifierSchema
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

  return deepFreeze(parsed);
}
