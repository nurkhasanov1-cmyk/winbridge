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
export type AuditJsonValue =
  | string
  | number
  | boolean
  | null
  | AuditJsonValue[]
  | { [key: string]: AuditJsonValue };
export type AuditDetail = Record<string, AuditJsonValue>;

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
const JSON_COMPATIBLE_AUDIT_DETAIL_MESSAGE = "Audit detail must be JSON-compatible";

export const AuditDetailSchema: z.ZodType<AuditDetail> = z.custom<AuditDetail>(
  (value): value is AuditDetail => isAuditDetail(value),
  JSON_COMPATIBLE_AUDIT_DETAIL_MESSAGE
);

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
  detail: AuditDetailSchema.default({})
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
  "clipboardtext",
  "clipboardcontent",
  "clipboardcontents",
  "filecontent",
  "filedata",
  "filebytes",
  "filetransfercontent",
  "filetransferdata",
  "filetransferbytes",
  "diagnosticcontent",
  "diagnosticdump",
  "diagnosticscontent",
  "diagnosticsdump",
  "apikey",
  "cookie",
  "privatekey",
  "authorizationheader",
  "authheader",
  "proxyauthorization"
] as const;
const sensitiveKeyExactMatches = new Set([
  "authorization",
  "clipboard",
  "decisionreason",
  "denialreason",
  "devicedisplayname",
  "displayname",
  "filetransfer",
  "diagnostic",
  "diagnostics",
  "hostdisplayname",
  "lifecyclereason",
  "pausereason",
  "privatereason",
  "rawreason",
  "reason",
  "reasontext",
  "resumereason",
  "revokereason",
  "terminatereason",
  "terminationreason",
  "viewerdisplayname"
]);
const nonSensitiveKeyExactMatches = new Set(["authorizationid"]);
const REDACTED_AUDIT_VALUE = "[REDACTED]";
const safeAuditReasons = new Set([
  "Invalid relay token",
  "Pairing code mismatch",
  "Relay token rate limit exceeded"
]);
const sensitiveReasonMarkerPattern =
  /\b(?:token|credential|password|secret|pairing[\s_-]*code|api[\s_-]*key|authorization|proxy[\s_-]*authorization|authorization[\s_-]*header|auth[\s_-]*header|cookie|private[\s_-]*key|keystroke|screenshot|screen[\s_-]*data|screen[\s_-]*content)\b\s*(?::|=|\s+)\s*\S+/i;
const sensitiveRemoteContentReasonPattern =
  /(?:\b(?:clipboard(?:[\s_-]*(?:text|content|contents))?|file[\s_-]*(?:content|data|bytes|transfer)|diagnostic(?:s)?(?:[\s_-]*(?:content|dump))?)\b\s*(?::|=)\s*\S+)|(?:\b(?:clipboard[\s_-]*(?:text|content|contents)|file[\s_-]*(?:content|data|bytes)|diagnostic(?:s)?[\s_-]*(?:content|dump))\b\s+\S+)/i;
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

export function redactAuditDetail(detail: Record<string, unknown>): AuditDetail {
  const parsedDetail = AuditDetailSchema.parse(detail);
  return AuditDetailSchema.parse(redactValue(parsedDetail));
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
    sensitiveRemoteContentReasonPattern.test(reason) ||
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

function isAuditDetail(value: unknown): value is AuditDetail {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isPlainJsonObject(value)) {
    return false;
  }

  if (!hasOnlyJsonObjectProperties(value)) {
    return false;
  }

  const ancestors = new WeakSet<object>();
  ancestors.add(value);
  const valid = Object.values(value).every((detailValue) =>
    isAuditJsonValue(detailValue, ancestors)
  );
  ancestors.delete(value);
  return valid;
}

function isAuditJsonValue(value: unknown, ancestors = new WeakSet<object>()): value is AuditJsonValue {
  if (value === null) {
    return true;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "object") {
    return false;
  }

  if (ancestors.has(value)) {
    return false;
  }
  ancestors.add(value);

  const valid = Array.isArray(value)
    ? isAuditJsonArray(value, ancestors)
    : isPlainJsonObject(value) &&
      hasOnlyJsonObjectProperties(value) &&
      Object.values(value).every((nested) => isAuditJsonValue(nested, ancestors));

  ancestors.delete(value);
  return valid;
}

function isPlainJsonObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isAuditJsonArray(value: unknown[], ancestors: WeakSet<object>): boolean {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === "length") {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor?.enumerable ||
      !("value" in descriptor) ||
      !isArrayIndexKey(key, value.length)
    ) {
      return false;
    }
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return false;
    }

    if (!isAuditJsonValue(value[index], ancestors)) {
      return false;
    }
  }

  return true;
}

function hasOnlyJsonObjectProperties(value: object): boolean {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }

  return Object.getOwnPropertyNames(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor?.enumerable) && Boolean(descriptor && "value" in descriptor);
  });
}

function isArrayIndexKey(key: string, length: number): boolean {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}
