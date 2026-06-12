## Context

WinBridge uses shared audit records and protocol `audit-event` messages to prove consent, authorization, relay rejection, and workflow safety behavior during development. These records already validate structure and redact sensitive detail, but some semantic string fields use length-only checks and can accept whitespace-only values.

This change touches audit metadata validation only. It does not change relay routing, authorization grants, native Windows behavior, capture, input, installer, services, startup, tokens, or privilege behavior.

## Goals / Non-Goals

**Goals:**

- Reject whitespace-only shared audit record `action`, optional `reason`, and target `type` values.
- Reject whitespace-only protocol `audit-event.action` values.
- Keep existing sensitive detail redaction behavior unchanged.
- Keep safe bounded audit reasons and existing action names valid.

**Non-Goals:**

- No new audit persistence backend or durable storage.
- No changes to relay policy routing or peer authority.
- No changes to remote capture, input, clipboard, file transfer, diagnostics, or Windows APIs.
- No stealth, persistence, credential access, keylogging, evasion, or Windows prompt bypass behavior.

## Decisions

1. Validate blank semantics at schema boundaries.

   The shared audit schema and protocol audit-event schema will refine the relevant strings with `trim().length > 0`. Alternative considered: trim values before storing. Rejection is safer because it preserves caller intent and prevents silently normalizing ambiguous security logs.

2. Scope the change to audit metadata fields that carry semantic meaning.

   The implementation will not broadly rewrite all user-facing display strings in protocol messages. Display-name policy can be handled separately because it affects UI/identity semantics beyond audit metadata.

3. Preserve existing redaction pipeline.

   Redaction remains responsible for sensitive values; blank validation only rejects meaningless action/reason/target labels. This avoids mixing secrecy policy with schema completeness policy.

## Risks / Trade-offs

- Some tests or local callers may have used whitespace placeholders. Mitigation: reject them early and update callers to provide real bounded metadata or omit optional reasons.
- Rejection is stricter than trimming. Mitigation: this is deliberate for audit integrity; security-relevant logs should not silently change caller-provided semantics.

## Migration Plan

No data migration is required. Existing valid audit records and protocol audit-event messages remain valid. Invalid whitespace-only metadata now fails schema validation before being emitted, forwarded, or persisted.

## Open Questions

None.
