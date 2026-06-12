## Context

WinBridge audit records already validate required shape, identifier bounds, JSON-compatible detail metadata, and redaction of secrets or private reason text. Audit semantic metadata such as `action`, top-level `reason`, and `target.type` is currently only checked for non-blank content, which allows visually ambiguous padded values.

## Goals / Non-Goals

**Goals:**

- Enforce canonical, already-trimmed audit semantic metadata at shared audit schema boundaries.
- Enforce the same canonical rule for protocol `audit-event.action`.
- Preserve existing sensitive reason redaction and audit detail redaction behavior.

**Non-Goals:**

- No automatic trimming or rewriting of audit metadata.
- No production audit storage, account identity, relay authentication, MFA, or retention policy changes.
- No remote action, screen capture, input, clipboard, file transfer, reconnect, installer, service, startup, privilege, token, or native Windows API changes.

## Decisions

1. Reject untrimmed audit metadata instead of trimming it.
   - Rationale: audit records should preserve exact semantic values. Silent trimming can hide malformed producer behavior and produce different raw input versus persisted record values.
   - Alternative considered: normalize by trimming before validation. Rejected because audit metadata is security-relevant and should fail closed when producers send ambiguous values.

2. Validate both shared audit records and protocol `audit-event` messages.
   - Rationale: `createAuditRecord` and protocol `audit-event` parsing are separate trust boundaries. Both can be reached independently by current and future components.
   - Alternative considered: rely only on audit sink validation. Rejected because protocol audit events may be parsed, encoded, forwarded, or emitted before reaching a sink.

3. Keep diagnostic messages generic.
   - Rationale: top-level audit reasons can contain private context before redaction, so validation failures must not echo raw values.
   - Alternative considered: include rejected values in errors for developer convenience. Rejected because logs and CLI diagnostics must remain secret-safe.

## Risks / Trade-offs

- [Risk] Existing development code that emits padded audit actions, reasons, or target types will now fail. -> Mitigation: producers can pass the same metadata without surrounding whitespace; this is a narrow metadata contract.
- [Risk] Stricter audit metadata validation could be confused with production audit integrity. -> Mitigation: docs continue to distinguish development audit sinks from future production durable audit storage and identity.
