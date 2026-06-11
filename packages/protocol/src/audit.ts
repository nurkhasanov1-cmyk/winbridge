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

export const AuditRecordSchema = z.object({
  eventId: ProtocolIdentifierSchema.min(8),
  timestamp: z.string().datetime(),
  actor: AuditActorSchema,
  action: z.string().min(1).max(160),
  outcome: AuditOutcomeSchema,
  sessionId: SessionIdSchema.optional(),
  target: z
    .object({
      type: z.string().min(1).max(80),
      id: ProtocolIdentifierSchema
    })
    .optional(),
  reason: z.string().min(1).max(240).optional(),
  detail: z.record(z.unknown()).default({})
});
export type AuditRecord = z.infer<typeof AuditRecordSchema>;
export type AuditRecordInput = Omit<AuditRecord, "eventId" | "timestamp"> & {
  eventId?: string;
  timestamp?: string;
};

const sensitiveKeyPattern =
  /(token|credential|password|secret|pairingcode|keystroke|screenshot|screendata|screencontent)/i;

export function createAuditRecord(input: AuditRecordInput): AuditRecord {
  return AuditRecordSchema.parse({
    ...input,
    eventId: input.eventId ?? `audit_${randomUUID()}`,
    timestamp: input.timestamp ?? new Date().toISOString(),
    detail: redactAuditDetail(input.detail ?? {})
  });
}

export function redactAuditDetail(detail: Record<string, unknown>): Record<string, unknown> {
  return redactValue(detail) as Record<string, unknown>;
}

function redactValue(value: unknown, key?: string): unknown {
  if (key && sensitiveKeyPattern.test(key)) {
    return "[REDACTED]";
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
