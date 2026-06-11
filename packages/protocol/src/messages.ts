import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { AuditOutcomeSchema, redactAuditDetail } from "./audit.js";
import { SessionAuthorizationStatusSchema } from "./authorization.js";
import { DeviceIdentitySchema } from "./identity.js";
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
  "pairingcode",
  "keystroke",
  "keylog",
  "screenshot",
  "screendata",
  "screencontent",
  "secret"
] as const;

const BaseMessageSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  messageId: ProtocolIdentifierSchema,
  sessionId: SessionIdSchema,
  createdAt: z.string().datetime()
});
const ProtocolReasonSchema = z
  .string()
  .min(1)
  .max(240)
  .refine((reason) => reason.trim().length > 0, "Reason must not be blank");

export const HelloMessageSchema = BaseMessageSchema.extend({
  type: z.literal("hello"),
  peerId: PeerIdSchema,
  role: SessionRoleSchema,
  displayName: z.string().min(1).max(120),
  capabilities: z.array(z.string().min(1).max(80)).max(32)
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
  viewerDisplayName: z.string().min(1).max(120),
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
  authorizationId: ProtocolIdentifierSchema.min(8),
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
  authorizationId: ProtocolIdentifierSchema.min(8),
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

  const grantBearingState =
    message.status === "approved" || message.status === "active" || message.status === "paused";

  if (grantBearingState && message.permissions.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${message.status} session authorization state requires permissions`,
      path: ["permissions"]
    });
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
  authorizationId: ProtocolIdentifierSchema.min(8),
  actorPeerId: PeerIdSchema,
  revokedPermission: PermissionSchema,
  reason: ProtocolReasonSchema
});

export const RelayReadyMessageSchema = BaseMessageSchema.extend({
  type: z.literal("relay-ready"),
  peerId: PeerIdSchema,
  roomSize: z.number().int().min(1).max(2)
});

export const PeerDisconnectedReasonCodeSchema = z.enum(["peer-closed"]);

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
  payload: z.record(z.unknown())
}).superRefine((message, context) => {
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
  action: z.string().min(1).max(120),
  outcome: AuditOutcomeSchema,
  detail: z.record(z.unknown()).default({}).transform(redactAuditDetail)
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
  return ProtocolEnvelopeSchema.parse(input);
}

export function decodeProtocolEnvelope(raw: string): ProtocolEnvelope {
  return parseProtocolEnvelope(JSON.parse(raw));
}

export function encodeProtocolEnvelope(envelope: ProtocolEnvelope): string {
  return JSON.stringify(parseProtocolEnvelope(envelope));
}

export function createMessageBase(sessionId: string) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    messageId: randomUUID(),
    sessionId,
    createdAt: new Date().toISOString()
  } as const;
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

function measureSignalPayloadBytes(
  payload: Record<string, unknown>,
  context: z.RefinementCtx
): number | undefined {
  try {
    return Buffer.byteLength(JSON.stringify(payload), "utf8");
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Signal payload must be JSON serializable",
      path: ["payload"]
    });
    return undefined;
  }
}

function findSensitiveSignalPayloadPath(
  value: unknown,
  path: Array<string | number> = []
): Array<string | number> | undefined {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findSensitiveSignalPayloadPath(item, [...path, index]);
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
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (SENSITIVE_SIGNAL_PAYLOAD_KEY_INDICATORS.some((indicator) => normalizedKey.includes(indicator))) {
      return [...path, key];
    }

    const found = findSensitiveSignalPayloadPath(nested, [...path, key]);
    if (found) {
      return found;
    }
  }

  return undefined;
}
