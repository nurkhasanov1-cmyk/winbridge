## Context

`createAuditRecord()` is the shared creation path used by memory, console, and
file audit sinks. It already redacts recursively through the `detail` object, but
it passes the top-level `reason` string directly into the validated record. Relay
and agent-shell callers already try to provide bounded reasons; this change adds
a shared defense-in-depth guard for mistakes.

## Goals / Non-Goals

**Goals:**

- Redact top-level audit reasons that contain obvious sensitive material before
  they are returned from `createAuditRecord()` or emitted by shared sinks.
- Preserve safe bounded reasons such as `Invalid relay message` and
  `Pairing code mismatch`.
- Keep the JSONL audit format and public audit record schema stable.
- Add tests at the protocol audit and audit sink layers.

**Non-Goals:**

- Do not allow relay or agent-shell code to pass raw exception messages, private
  lifecycle text, protocol payloads, tokens, pairing codes, or credentials as a
  normal practice.
- Do not change protocol message reason fields or wire behavior.
- Do not add capture, input, clipboard, file transfer, installer, startup,
  service, persistence, credential access, or privilege behavior.

## Decisions

- Reuse the existing audit sensitive-key vocabulary for reason scanning. This
  keeps the allow/deny vocabulary consistent between `detail` keys and top-level
  reason redaction. Alternative considered: maintain a separate list for
  reasons, but that creates drift and misses keys already treated as unsafe in
  audit details.
- Redact the entire reason string when it contains an obvious sensitive marker.
  Alternative considered: token-by-token replacement, but partial parsing risks
  leaving fragments in logs and makes audit output less predictable.
- Preserve the `reason` field as optional string with the same length bound.
  Alternative considered: rejecting records with unsafe reasons. Redaction is
  safer for audit sinks because write paths should not fail after a sensitive
  event solely because a caller supplied unsafe text.

## Risks / Trade-offs

- False positives may redact a benign reason containing words like `token` or
  `credential` -> mitigation: safe bounded reason strings in existing relay and
  agent-shell paths do not use those markers, and redaction is preferable to
  leaking secrets in audit output.
- Reason scanning cannot identify every possible secret value -> mitigation:
  callers remain responsible for bounded metadata-only reasons; this is
  defense-in-depth, not a replacement for safe caller behavior.
- Audit records may lose diagnostic detail when redacted -> mitigation: details
  can carry safe metadata such as byte lengths, roles, booleans, and bounded
  identifiers while sensitive text is excluded.

## Migration Plan

No data migration is required. Existing audit readers continue seeing the same
record shape. New records may contain `[REDACTED]` in `reason` when the input
reason contains obvious sensitive material.

## Open Questions

None.
