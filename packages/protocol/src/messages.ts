import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  AuditDetailSchema,
  AuditOutcomeSchema,
  hasSecretBearingAuditMetadata,
  redactAuditDetail
} from "./audit.js";
import { AuthorizationIdSchema, SessionAuthorizationStatusSchema } from "./authorization.js";
import { DeviceDisplayNameSchema, DeviceIdentitySchema } from "./identity.js";
import { createJsonObjectSchema, stringifyJson, type JsonObject, type JsonValue } from "./json.js";
import {
  PairingCodeSchema,
  PeerIdSchema,
  PermissionSchema,
  ProtocolIdentifierSchema,
  SessionIdSchema,
  SessionRoleSchema
} from "./session.js";

export const PROTOCOL_VERSION = 1;
const MAX_SIGNAL_PAYLOAD_BYTES = 16 * 1024;
const SENSITIVE_SIGNAL_PAYLOAD_KEY_INDICATORS = [
  "token",
  "credential",
  "password",
  "passphrase",
  "apikey",
  "authorizationheader",
  "authheader",
  "proxyauthorization",
  "accesskey",
  "cookie",
  "privatekey",
  "sshkey",
  "pairingcode",
  "keystroke",
  "keylog",
  "keylogger",
  "screenshot",
  "screendata",
  "screencontent",
  "clipboard",
  "filecontent",
  "filedata",
  "filebytes",
  "filetransfer",
  "diagnostic",
  "secret"
] as const;
const SENSITIVE_SIGNAL_PAYLOAD_KEY_EXACT_MATCHES = new Set(["authorization"]);
const SAFE_SIGNAL_PAYLOAD_KEY_EXACT_MATCHES = new Set(["authorizationid"]);

const BaseMessageSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  messageId: ProtocolIdentifierSchema,
  sessionId: SessionIdSchema,
  createdAt: z.string().datetime()
}).strict();
const ProtocolReasonSchema = z
  .string()
  .min(1)
  .max(240)
  .refine((reason) => reason.trim().length > 0, "Reason must not be blank")
  .refine((reason) => reason === reason.trim(), "Reason must be trimmed")
  .refine((reason) => !hasAsciiControlCharacter(reason), "Reason must not contain ASCII control characters")
  .refine(
    (reason) => !hasUnsafeFormatCharacter(reason),
    "Reason must not contain Unicode bidi or zero-width formatting controls"
  )
  .refine(
    (reason) => !hasSecretBearingAuditMetadata(reason, { includeKeyAssignments: false }),
    "Reason must not contain sensitive metadata"
  );
const ProtocolAuditActionSchema = z
  .string()
  .min(1)
  .max(120)
  .refine((action) => action.trim().length > 0, "Audit event action must not be blank")
  .refine((action) => action === action.trim(), "Audit event action must be trimmed")
  .refine(
    (action) => !hasAsciiControlCharacter(action),
    "Audit event action must not contain ASCII control characters"
  )
  .refine(
    (action) => !hasUnsafeFormatCharacter(action),
    "Audit event action must not contain Unicode bidi or zero-width formatting controls"
  )
  .refine(
    (action) => !hasSecretBearingAuditMetadata(action),
    "Audit event action must not contain sensitive metadata"
  );
const ProtocolCapabilitySchema = z
  .string()
  .min(1)
  .max(80)
  .refine((capability) => capability.trim().length > 0, "Capability must not be blank")
  .refine((capability) => capability === capability.trim(), "Capability must be trimmed")
  .refine(
    (capability) => !hasAsciiControlCharacter(capability),
    "Capability must not contain ASCII control characters"
  )
  .refine(
    (capability) => !hasUnsafeFormatCharacter(capability),
    "Capability must not contain Unicode bidi or zero-width formatting controls"
  );
const SignalPayloadSchema = createJsonObjectSchema(
  "Signal payload must be JSON-compatible"
);

export const HelloMessageSchema = BaseMessageSchema.extend({
  type: z.literal("hello"),
  peerId: PeerIdSchema,
  role: SessionRoleSchema,
  displayName: DeviceDisplayNameSchema,
  capabilities: z.array(ProtocolCapabilitySchema).max(32)
}).superRefine((message, context) => {
  rejectDuplicateCapabilities(message.capabilities, context);
});

export const JoinSessionMessageSchema = BaseMessageSchema.extend({
  type: z.literal("join-session"),
  peerId: PeerIdSchema,
  role: SessionRoleSchema,
  pairingCode: PairingCodeSchema,
  deviceIdentity: DeviceIdentitySchema.optional()
});

export const HostConsentRequiredMessageSchema = BaseMessageSchema.extend({
  type: z.literal("host-consent-required"),
  viewerPeerId: PeerIdSchema,
  viewerDisplayName: DeviceDisplayNameSchema,
  requestedPermissions: z.array(PermissionSchema).min(1).max(16)
}).superRefine((message, context) => {
  rejectDuplicatePermissions(message.requestedPermissions, context, "requestedPermissions");
});

export const HostConsentDecisionMessageSchema = BaseMessageSchema.extend({
  type: z.literal("host-consent-decision"),
  hostPeerId: PeerIdSchema,
  viewerPeerId: PeerIdSchema,
  approved: z.boolean(),
  grantedPermissions: z.array(PermissionSchema).max(16),
  reason: ProtocolReasonSchema.optional()
}).superRefine((message, context) => {
  rejectDuplicatePermissions(message.grantedPermissions, context, "grantedPermissions");

  if (message.approved && message.grantedPermissions.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Approved host consent decisions require granted permissions",
      path: ["grantedPermissions"]
    });
  }

  if (!message.approved && message.grantedPermissions.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Denied host consent decisions cannot grant permissions",
      path: ["grantedPermissions"]
    });
  }

  if (!message.approved && (message.reason?.trim().length ?? 0) === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Denied host consent decisions require a reason",
      path: ["reason"]
    });
  }
});

export const SessionAuthorizationRequestMessageSchema = BaseMessageSchema.extend({
  type: z.literal("session-authorization-request"),
  viewerPeerId: PeerIdSchema,
  requestedPermissions: z.array(PermissionSchema).min(1).max(16),
  reason: ProtocolReasonSchema.optional()
}).superRefine((message, context) => {
  rejectDuplicatePermissions(message.requestedPermissions, context, "requestedPermissions");
});

export const SessionAuthorizationDecisionMessageSchema = BaseMessageSchema.extend({
  type: z.literal("session-authorization-decision"),
  authorizationId: AuthorizationIdSchema,
  hostPeerId: PeerIdSchema,
  viewerPeerId: PeerIdSchema,
  decision: z.enum(["approved", "denied"]),
  grantedPermissions: z.array(PermissionSchema).max(16),
  expiresAt: z.string().datetime().optional(),
  reason: ProtocolReasonSchema.optional()
}).superRefine((message, context) => {
  rejectDuplicatePermissions(message.grantedPermissions, context, "grantedPermissions");

  if (message.decision === "approved" && !message.expiresAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Approved session authorization decisions require expiresAt",
      path: ["expiresAt"]
    });
  }

  if (message.decision === "approved" && message.expiresAt) {
    requireExpirationAfterCreatedAt(
      message.createdAt,
      message.expiresAt,
      context,
      "approved authorization decisions"
    );
  }

  if (message.decision === "approved" && message.grantedPermissions.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Approved session authorization decisions require granted permissions",
      path: ["grantedPermissions"]
    });
  }

  if (message.decision === "denied" && message.grantedPermissions.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Denied session authorization decisions cannot grant permissions",
      path: ["grantedPermissions"]
    });
  }

  if (message.decision === "denied" && message.expiresAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Denied session authorization decisions cannot include expiresAt",
      path: ["expiresAt"]
    });
  }

  if (message.decision === "denied" && !message.reason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Denied session authorization decisions require a reason",
      path: ["reason"]
    });
  }
});

export const SessionAuthorizationStateMessageSchema = BaseMessageSchema.extend({
  type: z.literal("session-authorization-state"),
  authorizationId: AuthorizationIdSchema,
  actorPeerId: PeerIdSchema,
  status: SessionAuthorizationStatusSchema,
  visibleToHost: z.boolean(),
  permissions: z.array(PermissionSchema).max(16),
  expiresAt: z.string().datetime(),
  reason: ProtocolReasonSchema.optional()
}).superRefine((message, context) => {
  rejectDuplicatePermissions(message.permissions, context, "permissions");

  if ((message.status === "active" || message.status === "paused") && !message.visibleToHost) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Active or paused session authorization state requires visibleToHost",
      path: ["visibleToHost"]
    });
  }

  if ((message.status === "pending" || message.status === "approved" || message.status === "denied") && message.visibleToHost) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${message.status} session authorization state cannot be visible before activation`,
      path: ["visibleToHost"]
    });
  }

  const grantBearingState =
    message.status === "approved" || message.status === "active" || message.status === "paused";

  const terminalState =
    message.status === "denied" ||
    message.status === "revoked" ||
    message.status === "terminated" ||
    message.status === "expired";

  if (terminalState && !message.reason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${message.status} session authorization state requires reason`,
      path: ["reason"]
    });
  }

  if (grantBearingState && message.permissions.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${message.status} session authorization state requires permissions`,
      path: ["permissions"]
    });
  }

  if (grantBearingState) {
    requireExpirationAfterCreatedAt(
      message.createdAt,
      message.expiresAt,
      context,
      `${message.status} authorization state`
    );
  }

  if (!grantBearingState && message.permissions.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${message.status} session authorization state cannot carry permissions`,
      path: ["permissions"]
    });
  }
});

export const PermissionRevokedMessageSchema = BaseMessageSchema.extend({
  type: z.literal("permission-revoked"),
  authorizationId: AuthorizationIdSchema,
  actorPeerId: PeerIdSchema,
  revokedPermission: PermissionSchema,
  reason: ProtocolReasonSchema
});

export const RelayReadyMessageSchema = BaseMessageSchema.extend({
  type: z.literal("relay-ready"),
  peerId: PeerIdSchema,
  roomSize: z.number().int().min(1).max(2)
});

export const PeerDisconnectedReasonCodeSchema = z.enum(["peer-closed", "heartbeat-timeout"]);

export const PeerDisconnectedMessageSchema = BaseMessageSchema.extend({
  type: z.literal("peer-disconnected"),
  peerId: PeerIdSchema,
  role: SessionRoleSchema,
  reasonCode: PeerDisconnectedReasonCodeSchema
});

export const SignalMessageSchema = BaseMessageSchema.extend({
  type: z.literal("signal"),
  fromPeerId: PeerIdSchema,
  toPeerId: PeerIdSchema.optional(),
  payload: SignalPayloadSchema
}).superRefine((message, context) => {
  const unsafePayloadKeyKind = findUnsafeSignalPayloadKeyKind(message.payload);
  if (unsafePayloadKeyKind) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        unsafePayloadKeyKind === "ascii-control"
          ? "Signal payload keys must not contain ASCII control characters"
          : "Signal payload keys must not contain Unicode bidi or zero-width formatting controls",
      path: ["payload"]
    });
    return;
  }

  const authorizationId = message.payload.authorizationId;
  if (typeof authorizationId !== "string") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Signal payload requires authorizationId",
      path: ["payload", "authorizationId"]
    });
  } else {
    const parsedAuthorizationId = AuthorizationIdSchema.safeParse(authorizationId);
    if (!parsedAuthorizationId.success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Signal payload authorizationId must be a valid protocol identifier",
        path: ["payload", "authorizationId"]
      });
    }
  }

  if (Object.keys(message.payload).length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Signal payload must not be empty",
      path: ["payload"]
    });
  }

  const payloadBytes = measureSignalPayloadBytes(message.payload, context);
  if (payloadBytes !== undefined && payloadBytes > MAX_SIGNAL_PAYLOAD_BYTES) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Signal payload must be ${MAX_SIGNAL_PAYLOAD_BYTES} bytes or less`,
      path: ["payload"]
    });
  }

  const sensitivePath = findSensitiveSignalPayloadPath(message.payload);
  if (sensitivePath) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Signal payload must not contain sensitive remote-assistance data",
      path: ["payload", ...sensitivePath]
    });
  }
});

export const SessionControlMessageSchema = BaseMessageSchema.extend({
  type: z.literal("session-control"),
  authorizationId: AuthorizationIdSchema,
  actorPeerId: PeerIdSchema,
  action: z.enum(["pause", "resume", "terminate", "revoke-permission"]),
  permission: PermissionSchema.optional(),
  reason: ProtocolReasonSchema.optional()
}).superRefine((message, context) => {
  if (message.action === "revoke-permission" && !message.permission) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Revoke-permission session control messages require permission",
      path: ["permission"]
    });
  }

  if (message.action === "revoke-permission" && !message.reason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Revoke-permission session control messages require reason",
      path: ["reason"]
    });
  }

  if (message.action === "terminate" && !message.reason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Terminate session control messages require reason",
      path: ["reason"]
    });
  }

  if (message.action !== "revoke-permission" && message.permission) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${message.action} session control messages cannot include permission`,
      path: ["permission"]
    });
  }

});

export const AuditEventMessageSchema = BaseMessageSchema.extend({
  type: z.literal("audit-event"),
  eventId: ProtocolIdentifierSchema,
  actorPeerId: PeerIdSchema,
  action: ProtocolAuditActionSchema,
  outcome: AuditOutcomeSchema,
  detail: AuditDetailSchema.default({}).transform(redactAuditDetail)
});

export const ProtocolEnvelopeSchema = z.union([
  HelloMessageSchema,
  JoinSessionMessageSchema,
  HostConsentRequiredMessageSchema,
  HostConsentDecisionMessageSchema,
  SessionAuthorizationRequestMessageSchema,
  SessionAuthorizationDecisionMessageSchema,
  SessionAuthorizationStateMessageSchema,
  PermissionRevokedMessageSchema,
  RelayReadyMessageSchema,
  PeerDisconnectedMessageSchema,
  SignalMessageSchema,
  SessionControlMessageSchema,
  AuditEventMessageSchema
]);

export type ProtocolEnvelope = z.infer<typeof ProtocolEnvelopeSchema>;

export function parseProtocolEnvelope(input: unknown): ProtocolEnvelope {
  return deepFreeze(ProtocolEnvelopeSchema.parse(input));
}

export function decodeProtocolEnvelope(raw: string): ProtocolEnvelope {
  return parseProtocolEnvelope(JSON.parse(raw));
}

export function encodeProtocolEnvelope(envelope: ProtocolEnvelope): string {
  return stringifyJson(parseProtocolEnvelope(envelope));
}

export function createMessageBase(sessionId: string) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    messageId: randomUUID(),
    sessionId,
    createdAt: new Date().toISOString()
  } as const;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }

  return Object.freeze(value) as T;
}

function rejectDuplicatePermissions(
  permissions: unknown[],
  context: z.RefinementCtx,
  path: "requestedPermissions" | "grantedPermissions" | "permissions"
): void {
  if (new Set(permissions).size === permissions.length) {
    return;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: `${path} must be unique`,
    path: [path]
  });
}

function rejectDuplicateCapabilities(capabilities: unknown[], context: z.RefinementCtx): void {
  const normalizedCapabilities = capabilities.map((capability) =>
    typeof capability === "string" ? capability.trim() : capability
  );
  if (new Set(normalizedCapabilities).size === normalizedCapabilities.length) {
    return;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: "capabilities must be unique",
    path: ["capabilities"]
  });
}

function requireExpirationAfterCreatedAt(
  createdAt: string,
  expiresAt: string,
  context: z.RefinementCtx,
  label: string
): void {
  if (Date.parse(expiresAt) > Date.parse(createdAt)) {
    return;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: `${label} require expiresAt after createdAt`,
    path: ["expiresAt"]
  });
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

function measureSignalPayloadBytes(
  payload: JsonObject,
  context: z.RefinementCtx
): number | undefined {
  try {
    return Buffer.byteLength(stringifyJson(payload), "utf8");
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Signal payload must be JSON serializable",
      path: ["payload"]
    });
    return undefined;
  }
}

function findUnsafeSignalPayloadKeyKind(
  value: JsonValue
): "ascii-control" | "format-control" | undefined {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (item === undefined) {
        return undefined;
      }

      const unsafeKind = findUnsafeSignalPayloadKeyKind(item);
      if (unsafeKind) {
        return unsafeKind;
      }
    }

    return undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (hasAsciiControlCharacter(key)) {
      return "ascii-control";
    }

    if (hasUnsafeFormatCharacter(key)) {
      return "format-control";
    }

    const unsafeKind = findUnsafeSignalPayloadKeyKind(nested);
    if (unsafeKind) {
      return unsafeKind;
    }
  }

  return undefined;
}

function findSensitiveSignalPayloadPath(
  value: unknown,
  path: Array<string | number> = []
): Array<string | number> | undefined {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findSensitiveSignalPayloadPath(value[index], [...path, index]);
      if (found) {
        return found;
      }
    }

    return undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveSignalPayloadKey(key)) {
      return [...path, key];
    }

    const found = findSensitiveSignalPayloadPath(nested, [...path, key]);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function isSensitiveSignalPayloadKey(key: string): boolean {
  const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (SAFE_SIGNAL_PAYLOAD_KEY_EXACT_MATCHES.has(normalizedKey)) {
    return false;
  }

  return (
    SENSITIVE_SIGNAL_PAYLOAD_KEY_EXACT_MATCHES.has(normalizedKey) ||
    SENSITIVE_SIGNAL_PAYLOAD_KEY_INDICATORS.some((indicator) => normalizedKey.includes(indicator))
  );
}
