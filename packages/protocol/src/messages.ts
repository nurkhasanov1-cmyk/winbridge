import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AuditOutcomeSchema, redactAuditDetail } from "./audit.js";
import { SessionAuthorizationStatusSchema } from "./authorization.js";
import { DeviceIdentitySchema } from "./identity.js";
import { PairingCodeSchema, PermissionSchema, SessionRoleSchema } from "./session.js";

export const PROTOCOL_VERSION = 1;

const BaseMessageSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  messageId: z.string().min(3),
  sessionId: z.string().min(3),
  createdAt: z.string().datetime()
});

export const HelloMessageSchema = BaseMessageSchema.extend({
  type: z.literal("hello"),
  peerId: z.string().min(3),
  role: SessionRoleSchema,
  displayName: z.string().min(1).max(120),
  capabilities: z.array(z.string().min(1).max(80)).max(32)
});

export const JoinSessionMessageSchema = BaseMessageSchema.extend({
  type: z.literal("join-session"),
  peerId: z.string().min(3),
  role: SessionRoleSchema,
  pairingCode: PairingCodeSchema,
  deviceIdentity: DeviceIdentitySchema.optional()
});

export const HostConsentRequiredMessageSchema = BaseMessageSchema.extend({
  type: z.literal("host-consent-required"),
  viewerPeerId: z.string().min(3),
  viewerDisplayName: z.string().min(1).max(120),
  requestedPermissions: z.array(PermissionSchema).max(16)
});

export const HostConsentDecisionMessageSchema = BaseMessageSchema.extend({
  type: z.literal("host-consent-decision"),
  hostPeerId: z.string().min(3),
  viewerPeerId: z.string().min(3),
  approved: z.boolean(),
  grantedPermissions: z.array(PermissionSchema).max(16),
  reason: z.string().max(240).optional()
});

export const SessionAuthorizationRequestMessageSchema = BaseMessageSchema.extend({
  type: z.literal("session-authorization-request"),
  viewerPeerId: z.string().min(3),
  requestedPermissions: z.array(PermissionSchema).min(1).max(16),
  reason: z.string().min(1).max(240).optional()
}).superRefine((message, context) => {
  rejectDuplicatePermissions(message.requestedPermissions, context, "requestedPermissions");
});

export const SessionAuthorizationDecisionMessageSchema = BaseMessageSchema.extend({
  type: z.literal("session-authorization-decision"),
  authorizationId: z.string().min(8),
  hostPeerId: z.string().min(3),
  viewerPeerId: z.string().min(3),
  decision: z.enum(["approved", "denied"]),
  grantedPermissions: z.array(PermissionSchema).max(16),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().min(1).max(240).optional()
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
  authorizationId: z.string().min(8),
  actorPeerId: z.string().min(3),
  status: SessionAuthorizationStatusSchema,
  visibleToHost: z.boolean(),
  permissions: z.array(PermissionSchema).max(16),
  expiresAt: z.string().datetime(),
  reason: z.string().min(1).max(240).optional()
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
  authorizationId: z.string().min(8),
  actorPeerId: z.string().min(3),
  revokedPermission: PermissionSchema,
  reason: z.string().min(1).max(240)
});

export const RelayReadyMessageSchema = BaseMessageSchema.extend({
  type: z.literal("relay-ready"),
  peerId: z.string().min(3),
  roomSize: z.number().int().min(1).max(2)
});

export const PeerDisconnectedReasonCodeSchema = z.enum(["peer-closed"]);

export const PeerDisconnectedMessageSchema = BaseMessageSchema.extend({
  type: z.literal("peer-disconnected"),
  peerId: z.string().min(3),
  role: SessionRoleSchema,
  reasonCode: PeerDisconnectedReasonCodeSchema
});

export const SignalMessageSchema = BaseMessageSchema.extend({
  type: z.literal("signal"),
  fromPeerId: z.string().min(3),
  toPeerId: z.string().min(3).optional(),
  payload: z.record(z.unknown())
});

export const SessionControlMessageSchema = BaseMessageSchema.extend({
  type: z.literal("session-control"),
  actorPeerId: z.string().min(3),
  action: z.enum(["pause", "resume", "terminate", "revoke-permission"]),
  permission: PermissionSchema.optional(),
  reason: z.string().max(240).optional()
});

export const AuditEventMessageSchema = BaseMessageSchema.extend({
  type: z.literal("audit-event"),
  eventId: z.string().min(3),
  actorPeerId: z.string().min(3),
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
