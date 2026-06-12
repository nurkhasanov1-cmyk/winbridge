## Context

WinBridge audit records are the evidence trail for consent, authorization, revocation, and failure paths. The shared audit schema currently allows `detail: Record<string, unknown>`, while development sinks and protocol envelopes serialize those records with JSON. That mismatch permits non-JSON runtime values to reach audit records and fail late or serialize differently than callers expect.

This change is limited to audit metadata validation. It does not introduce remote access capability or alter capture, input, relay transport, installer, service, startup, token, or privilege behavior.

## Goals / Non-Goals

**Goals:**
- Define one shared JSON-compatible audit detail contract for audit records and protocol `audit-event` detail metadata.
- Reject non-JSON values before audit records are retained, emitted, encoded, or persisted.
- Keep existing sensitive-key redaction behavior and ensure redacted output also satisfies the JSON-compatible contract.
- Make failure behavior deterministic for local development sinks.

**Non-Goals:**
- No native Windows UI, capture, input, installer, service, startup, privilege elevation, or persistence changes.
- No changes to signal payload semantics beyond protocol `audit-event` detail validation.
- No attempt to coerce unsupported JavaScript values into strings.

## Decisions

### Use an explicit recursive JSON value schema

Audit detail values will be validated as JSON primitives, arrays, or objects. Valid values are string, finite number, boolean, null, arrays of valid values, and objects whose values are valid. Invalid values include functions, symbols, bigint, `undefined`, `NaN`, `Infinity`, and `-Infinity`.

Rationale: explicit validation aligns the runtime contract with JSONL and protocol JSON encoding. It also avoids silent JSON behavior such as dropping `undefined` fields or converting non-finite numbers to `null`.

Alternative considered: rely on `JSON.stringify` failures at sink boundaries. That catches bigint but still silently omits or coerces other values, so it is not sufficient for audit integrity.

### Share the schema between records and protocol audit-event messages

`AuditRecordSchema` and `AuditEventMessageSchema` will use the same exported audit detail schema. Redaction stays centralized in `redactAuditDetail`.

Rationale: audit records and protocol audit-event messages carry the same class of metadata and should reject the same invalid shapes. Sharing the schema prevents divergence between local persistence and protocol emission.

Alternative considered: validate only in the file sink. That would leave in-memory history and protocol messages with a weaker contract, making tests and relay behavior inconsistent.

### Reject instead of coercing

Unsupported values will fail validation. The code will not stringify functions, symbols, bigint, or non-finite numbers into placeholder text.

Rationale: coercion could hide caller bugs and produce audit records whose detail no longer reflects the caller's intended metadata. Rejection is stricter and easier to reason about for security logs.

Alternative considered: map invalid values to `"[UNSUPPORTED]"`. That keeps writes succeeding but risks masking faulty audit instrumentation.

## Risks / Trade-offs

- [Risk] Existing callers that pass non-JSON test fixtures will start failing. -> Mitigation: update tests to use JSON-compatible detail for successful paths and add explicit rejection tests.
- [Risk] Circular schema definitions can produce weak TypeScript inference. -> Mitigation: keep the recursive JSON value type and schema in `packages/protocol/src/audit.ts`, export only the audit detail schema and type aliases needed by protocol messages.
- [Risk] Redaction could accidentally return unsupported values if fed unsupported input. -> Mitigation: parse the redacted detail through the same schema in record/message schemas and cover rejection with focused tests.

## Migration Plan

This is a bootstrap development API tightening. Callers must supply JSON-compatible audit detail metadata. Rollback is limited to reverting the schema and related tests if it blocks existing development workflows.

No stored audit migration is required because existing JSONL audit files already contain JSON values.

## Open Questions

None.
