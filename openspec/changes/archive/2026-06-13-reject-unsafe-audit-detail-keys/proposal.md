## Why

Audit detail values are already restricted to JSON-compatible data and sensitive detail fields are redacted recursively. However, extensible detail property names can still contain ASCII control characters or Unicode bidi/zero-width formatting controls. Those key names can make JSONL audit records visually ambiguous during incident review, even when the values are otherwise safe.

## What Changes

- Reject ASCII control characters in audit detail property names before records are returned, emitted, encoded, forwarded, or persisted.
- Reject Unicode bidirectional and zero-width formatting controls, including `U+FEFF`, in audit detail property names.
- Apply the same checks recursively to nested audit detail objects and protocol `audit-event.detail`.
- Add focused audit/protocol/relay regression tests proving malformed keys fail closed and diagnostics stay bounded.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `audit-foundation`: Audit detail metadata rejects unsafe property names in addition to non-JSON-compatible values.
- `relay-runtime`: Malformed protocol `audit-event.detail` key metadata is rejected before forwarding without leaking raw key text.

## Impact

- Affected code: `packages/protocol/src/audit.ts`.
- Affected tests: `packages/protocol/src/audit.test.ts`, `packages/protocol/src/messages.test.ts`, `apps/relay/src/server.integration.test.ts`.
- Affected docs/specs: audit foundation, relay runtime, README/security model where relevant.
- Security surface: audit/log metadata and protocol audit-event validation.
- Non-goals: no capture, input, clipboard, file transfer, installer, startup, service, privilege elevation, persistence, reconnect, or production auth changes.
