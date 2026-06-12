import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ProtocolIdentifierSchema, SessionIdSchema } from "./session.js";

export const AuditOutcomeSchema = z.enum(["accepted", "denied", "failed"]);
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

export const AuditActorSchema = z.object({
  type: z.enum(["system", "relay", "host", "viewer"]),
  id: ProtocolIdentifierSchema,
  deviceId: ProtocolIdentifierSchema.min(8).optional()
});
export type AuditActor = z.infer<typeof AuditActorSchema>;

const AuditActionSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((action) => action.trim().length > 0, "Audit action must not be blank");
const AuditReasonSchema = z
  .string()
  .min(1)
  .max(240)
  .refine((reason) => reason.trim().length > 0, "Audit reason must not be blank");
const AuditTargetTypeSchema = z
  .string()
  .min(1)
  .max(80)
  .refine((type) => type.trim().length > 0, "Audit target type must not be blank");

export const AuditRecordSchema = z.object({
  eventId: ProtocolIdentifierSchema.min(8),
  timestamp: z.string().datetime(),
  actor: AuditActorSchema,
  action: AuditActionSchema,
  outcome: AuditOutcomeSchema,
  sessionId: SessionIdSchema.optional(),
  target: z
    .object({
      type: AuditTargetTypeSchema,
      id: ProtocolIdentifierSchema
    })
    .optional(),
  reason: AuditReasonSchema.optional(),
  detail: z.record(z.unknown()).default({})
});
export type AuditRecord = z.infer<typeof AuditRecordSchema>;
export type AuditRecordInput = Omit<AuditRecord, "eventId" | "timestamp"> & {
  eventId?: string;
  timestamp?: string;
};

const sensitiveKeySubstrings = [
  "token",
  "credential",
  "password",
  "secret",
  "pairingcode",
  "keystroke",
  "screenshot",
  "screendata",
  "screencontent",
  "apikey",
  "cookie",
  "privatekey",
  "authorizationheader",
  "authheader",
  "proxyauthorization"
] as const;
const sensitiveKeyExactMatches = new Set(["authorization"]);
const nonSensitiveKeyExactMatches = new Set(["authorizationid"]);
const REDACTED_AUDIT_VALUE = "[REDACTED]";
const safeAuditReasons = new Set([
  "Invalid relay token",
  "Pairing code mismatch",
  "Relay token rate limit exceeded"
]);
const sensitiveReasonMarkerPattern =
  /\b(?:token|credential|password|secret|pairing[\s_-]*code|api[\s_-]*key|authorization|proxy[\s_-]*authorization|authorization[\s_-]*header|auth[\s_-]*header|cookie|private[\s_-]*key|keystroke|screenshot|screen[\s_-]*data|screen[\s_-]*content)\b\s*(?::|=|\s+)\s*\S+/i;
const sensitiveReasonCredentialPattern = /\b(?:bearer|basic)\s+[a-z0-9._~+/=-]+/i;
const sensitiveReasonPrivateKeyPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

export function createAuditRecord(input: AuditRecordInput): AuditRecord {
  return AuditRecordSchema.parse({
    ...input,
    eventId: input.eventId ?? `audit_${randomUUID()}`,
    timestamp: input.timestamp ?? new Date().toISOString(),
    reason: redactAuditReason(input.reason),
    detail: redactAuditDetail(input.detail ?? {})
  });
}

export function redactAuditDetail(detail: Record<string, unknown>): Record<string, unknown> {
  return redactValue(detail) as Record<string, unknown>;
}

function redactValue(value: unknown, key?: string): unknown {
  if (key && isSensitiveAuditDetailKey(key)) {
    return REDACTED_AUDIT_VALUE;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, entryKey)
      ])
    );
  }

  return value;
}

function redactAuditReason(reason: string | undefined): string | undefined {
  if (reason === undefined) {
    return undefined;
  }

  return isSensitiveAuditReason(reason) ? REDACTED_AUDIT_VALUE : reason;
}

function isSensitiveAuditReason(reason: string): boolean {
  if (safeAuditReasons.has(reason)) {
    return false;
  }

  return (
    sensitiveReasonMarkerPattern.test(reason) ||
    sensitiveReasonCredentialPattern.test(reason) ||
    sensitiveReasonPrivateKeyPattern.test(reason)
  );
}

function isSensitiveAuditDetailKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (nonSensitiveKeyExactMatches.has(normalizedKey)) {
    return false;
  }

  return (
    sensitiveKeyExactMatches.has(normalizedKey) ||
    sensitiveKeySubstrings.some((sensitiveKey) => normalizedKey.includes(sensitiveKey))
  );
}
