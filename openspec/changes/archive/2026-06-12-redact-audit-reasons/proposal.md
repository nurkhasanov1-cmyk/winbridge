## Why

Audit records already redact sensitive data inside `detail`, but the top-level
`reason` field can still persist caller-provided text verbatim. A single buggy
caller could write a raw token, pairing code, credential, protocol fragment, or
private lifecycle reason into memory, console, or JSONL audit output.

## What Changes

- Redact unsafe top-level audit `reason` values before audit records are stored
  or emitted by shared audit sinks.
- Preserve safe bounded audit reasons so existing relay and workflow diagnostics
  remain useful.
- Add focused tests for memory, console/file persistence, and protocol audit
  record creation.
- Update security and audit docs to state that top-level reasons are redacted
  when they contain obvious sensitive material.
- Non-goal: this does not allow callers to pass raw secrets intentionally. Relay
  and agent-shell code must continue producing bounded, metadata-only reasons.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `audit-log-persistence`: audit persistence must not store unsafe top-level
  reason text.

## Impact

- Affected code: `packages/protocol/src/audit.ts`,
  `packages/audit-log/src/index.test.ts`, `packages/protocol/src/audit.test.ts`.
- Affected docs/specs: `openspec/specs/audit-log-persistence/spec.md`,
  `docs/security-model.md`.
- Touches logs/audit behavior only. It does not touch capture, input, relay
  forwarding authority, installer, startup, services, tokens as credentials, or
  privilege elevation.
