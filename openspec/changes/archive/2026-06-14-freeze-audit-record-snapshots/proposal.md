## Why

Audit records are trusted security evidence after shared validation and redaction. If the shared `createAuditRecord` result stays mutable, a caller can accidentally change action, actor, outcome, reason, or redacted detail metadata after validation but before emitting, forwarding, persisting, or inspecting the record.

## What Changes

- Return immutable audit record snapshots from shared audit record creation.
- Freeze nested audit actor, target, and detail metadata after schema validation and redaction.
- Preserve existing audit validation, redaction, JSONL persistence, console output, and protocol wire shapes.
- Add regression tests proving callers cannot mutate audit action metadata or restore redacted detail/reason data in place.
- Non-goal: add no new remote action permission, protocol message type, audit sink, relay routing behavior, capture, input, clipboard, file transfer, diagnostics, installer, startup, service, token, credential, logging backend, or privilege-elevation capability.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `audit-foundation`: shared audit records become immutable snapshots after validation and redaction.

## Impact

- Affected code: `packages/protocol/src/audit.ts`, `packages/protocol/src/audit.test.ts`, and possibly audit sink tests that assert returned record behavior.
- Consumers still receive the same JSON-compatible audit record shape, but post-creation mutation fails instead of silently changing trusted audit evidence.
- This touches audit/log safety boundaries only; it does not alter capture, input, relay transport, installer, service, native Windows API, startup, persistence, or privilege behavior.
