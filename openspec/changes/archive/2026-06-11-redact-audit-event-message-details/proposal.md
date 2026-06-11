## Why

Audit records are redacted before local sink storage, but protocol `audit-event` messages currently accept arbitrary detail objects unchanged. Redacting audit-event detail during protocol parse/encode gives every sender a safer default and prevents accidental transmission of obvious secret-bearing fields.

## What Changes

- Redact sensitive audit-event detail fields through the shared protocol message schema.
- Reuse the existing audit detail redaction rules so storage and wire-contract behavior stay aligned.
- Add protocol tests proving sensitive audit-event details are redacted on parse and encode.
- Non-goals: no new remote actions, capture, input, installer, startup, service, token issuance, privilege elevation, or native Windows behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `audit-foundation`: add wire-level protocol audit-event detail redaction before audit metadata is emitted or forwarded.

## Impact

- Affected code: `packages/protocol/src/messages.ts`, `packages/protocol/src/messages.test.ts`.
- Affected specs: `openspec/specs/audit-foundation/spec.md` through this delta.
- Safety impact: reduces accidental exposure of tokens, credentials, pairing codes, keystroke data, screenshots, screen contents, and full secrets in audit-event payloads.
