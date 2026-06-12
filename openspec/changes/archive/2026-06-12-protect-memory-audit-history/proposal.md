## Why

`MemoryAuditSink` is used by relay and agent-shell tests to inspect security-relevant audit history. Today it returns mutable audit record objects, so caller code can accidentally mutate already-written records and weaken the reliability of audit assertions.

Making in-memory audit entries immutable improves development audit integrity without changing relay routing, authorization, or any remote capability.

## What Changes

- Freeze audit records stored by `MemoryAuditSink` after schema validation and redaction.
- Deep-freeze nested audit detail objects and arrays so returned records cannot mutate stored audit history.
- Preserve existing write order, `records()` inspection, `clear()`, redaction, and validation behavior.
- Add focused tests proving mutations of returned write results and `records()` results cannot alter retained audit history.
- Do not add native screen capture, remote input, clipboard sync, file transfer, diagnostics export, reconnect, installer behavior, services, startup persistence, privilege elevation, hidden sessions, AV/EDR evasion, or Windows prompt bypass.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `audit-foundation`: in-memory audit sink records are immutable snapshots after validation/redaction.

## Impact

- Affected code: `packages/audit-log/src/index.ts` and `packages/audit-log/src/index.test.ts`.
- Affected specs/docs: `audit-foundation` and operator-facing architecture/security docs if needed.
- Security impact: touches audit/log integrity only. It does not change authentication, authorization, relay networking, native Windows APIs, installer, startup, services, tokens, privilege, capture, input, or any remote action behavior.
