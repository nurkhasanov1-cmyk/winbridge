import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createJsonObjectSchema, type JsonObject, type JsonValue } from "./json.js";
import { ProtocolIdentifierSchema, SessionIdSchema } from "./session.js";

export const AuditOutcomeSchema = z.enum(["accepted", "denied", "failed"]);
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

export const AuditActorSchema = z.object({
  type: z.enum(["system", "relay", "host", "viewer"]),
  id: ProtocolIdentifierSchema,
  deviceId: ProtocolIdentifierSchema.min(8).optional()
}).strict().superRefine((actor, context) => {
  if ((actor.type === "system" || actor.type === "relay") && actor.deviceId !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["deviceId"],
      message: "Infrastructure audit actors must not include deviceId"
    });
  }
});
export type AuditActor = z.infer<typeof AuditActorSchema>;
export type AuditJsonValue = JsonValue;
export type AuditDetail = JsonObject;

const AuditActionSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((action) => action.trim().length > 0, "Audit action must not be blank")
  .refine((action) => action === action.trim(), "Audit action must be trimmed")
  .refine(
    (action) => !hasAsciiControlCharacter(action),
    "Audit action must not contain ASCII control characters"
  )
  .refine(
    (action) => !hasUnsafeFormatCharacter(action),
    "Audit action must not contain Unicode bidi or zero-width formatting controls"
  )
  .refine(
    (action) => !hasSecretBearingAuditMetadata(action),
    "Audit action must not contain sensitive metadata"
  );
const AuditReasonSchema = z
  .string()
  .min(1)
  .max(240)
  .refine((reason) => reason.trim().length > 0, "Audit reason must not be blank")
  .refine((reason) => reason === reason.trim(), "Audit reason must be trimmed")
  .refine(
    (reason) => !hasAsciiControlCharacter(reason),
    "Audit reason must not contain ASCII control characters"
  )
  .refine(
    (reason) => !hasUnsafeFormatCharacter(reason),
    "Audit reason must not contain Unicode bidi or zero-width formatting controls"
  );
const AuditTargetTypeSchema = z
  .string()
  .min(1)
  .max(80)
  .refine((type) => type.trim().length > 0, "Audit target type must not be blank")
  .refine((type) => type === type.trim(), "Audit target type must be trimmed")
  .refine(
    (type) => !hasAsciiControlCharacter(type),
    "Audit target type must not contain ASCII control characters"
  )
  .refine(
    (type) => !hasUnsafeFormatCharacter(type),
    "Audit target type must not contain Unicode bidi or zero-width formatting controls"
  );

export const AuditDetailSchema = createJsonObjectSchema(
  "Audit detail must be JSON-compatible"
).superRefine((detail, context) => {
  const unsafeKind = findUnsafeAuditDetailKeyKind(detail);
  if (unsafeKind === "ascii-control") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Audit detail keys must not contain ASCII control characters"
    });
    return;
  }

  if (unsafeKind === "format-control") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Audit detail keys must not contain Unicode bidi or zero-width formatting controls"
    });
  }
});

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
    .strict()
    .optional(),
  reason: AuditReasonSchema.optional(),
  detail: AuditDetailSchema.default({})
}).strict();
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
  "keylog",
  "keylogger",
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
  "accesskey",
  "cookie",
  "privatekey",
  "sshkey",
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
  /\b(?:token|credential|password|secret|pairing[\s_-]*code|api[\s_-]*key|access[\s_-]*key|authorization|proxy[\s_-]*authorization|authorization[\s_-]*header|auth[\s_-]*header|set[\s_-]*cookie|session[\s_-]*cookie|cookie|private[\s_-]*key|ssh[\s_-]*key|keystroke|screenshot|screen[\s_-]*data|screen[\s_-]*content)\b\s*(?::|=|\s+)\s*\S+/i;
const sensitiveRemoteContentReasonPattern =
  /(?:\b(?:clipboard(?:[\s_-]*(?:text|content|contents))?|file[\s_-]*(?:content|data|bytes|transfer)|diagnostic(?:s)?(?:[\s_-]*(?:content|dump))?)\b\s*(?::|=)\s*\S+)|(?:\b(?:clipboard[\s_-]*(?:text|content|contents)|file[\s_-]*(?:content|data|bytes)|diagnostic(?:s)?[\s_-]*(?:content|dump))\b\s+\S+)/i;
const sensitiveReasonCredentialPattern = /\b(?:bearer|basic)\s+[a-z0-9._~+/=-]+/i;
const sensitiveReasonPrivateKeyPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
const sensitiveMetadataAssignmentPattern =
  /(?:^|[\s,.;()[\]{}])([A-Za-z][A-Za-z0-9 _-]{0,80}?)(?::|=|\s+)\s*\S+/g;

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
    const redacted: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      redacted.push(redactValue(value[index]));
    }
    return redacted;
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

export function hasSecretBearingAuditMetadata(
  value: string,
  options: { includeKeyAssignments?: boolean } = {}
): boolean {
  if (safeAuditReasons.has(value)) {
    return false;
  }

  const includeKeyAssignments = options.includeKeyAssignments ?? true;

  return (
    sensitiveReasonMarkerPattern.test(value) ||
    sensitiveRemoteContentReasonPattern.test(value) ||
    sensitiveReasonCredentialPattern.test(value) ||
    sensitiveReasonPrivateKeyPattern.test(value) ||
    (includeKeyAssignments && hasSensitiveAuditMetadataAssignment(value))
  );
}

function isSensitiveAuditReason(reason: string): boolean {
  return hasSecretBearingAuditMetadata(reason, { includeKeyAssignments: false });
}

function hasSensitiveAuditMetadataAssignment(value: string): boolean {
  sensitiveMetadataAssignmentPattern.lastIndex = 0;

  for (const match of value.matchAll(sensitiveMetadataAssignmentPattern)) {
    const key = match[1]?.trim();
    if (key && isSensitiveAuditDetailKey(key)) {
      return true;
    }
  }

  return false;
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

function findUnsafeAuditDetailKeyKind(value: JsonValue): "ascii-control" | "format-control" | undefined {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (item === undefined) {
        return undefined;
      }

      const unsafeKind = findUnsafeAuditDetailKeyKind(item);
      if (unsafeKind) {
        return unsafeKind;
      }
    }

    return undefined;
  }

  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (hasAsciiControlCharacter(key)) {
        return "ascii-control";
      }

      if (hasUnsafeFormatCharacter(key)) {
        return "format-control";
      }

      const unsafeKind = findUnsafeAuditDetailKeyKind(nestedValue);
      if (unsafeKind) {
        return unsafeKind;
      }
    }
  }

  return undefined;
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
