## Why

Audit redaction already covers passwords and many authentication secret markers, but passphrases are a common credential form and should not remain inspectable in audit details, reasons, actions, or authorization-id metadata. This closes a log-safety gap without adding any new data collection or remote-assistance capability.

## What Changes

- Redact audit detail keys containing `passphrase` recursively before local storage, console output, protocol audit-event parsing, and protocol audit-event encoding.
- Redact top-level audit reasons and reject audit actions that include passphrase-bearing secret assignments.
- Treat passphrase-bearing authorization identifiers in audit detail as secret metadata and redact them.
- Cover shared audit records and protocol `audit-event` behavior with tests.
- No capture, input, clipboard, file-transfer, diagnostics collection, authentication, relay routing, installer, startup, service, token storage, privilege, or new logging sink behavior is added.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `audit-foundation`: expand audit redaction and audit action secret-marker requirements to include passphrase-bearing metadata.
- `audit-log-persistence`: expand audit reason redaction requirements to include passphrase-bearing secret material.

## Impact

- `packages/protocol/src/audit.ts`: shared audit secret-marker lists and reason/action detection.
- `packages/protocol/src/audit.test.ts`: shared audit record redaction/reason/action tests.
- `packages/protocol/src/messages.test.ts`: protocol audit-event parse/encode redaction tests.
- `openspec/specs/audit-foundation/spec.md` and `openspec/specs/audit-log-persistence/spec.md`: archived requirement updates after completion.
