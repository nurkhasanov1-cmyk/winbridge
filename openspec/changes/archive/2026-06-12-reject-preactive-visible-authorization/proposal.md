## Why

Host visibility is the gate that distinguishes an approved-but-not-active
authorization from an active visible session. The shared authorization schema and
protocol state schema currently allow `pending` or `approved` records to claim
`visibleToHost: true`, which can confuse future adapters even though action
checks still require `active`.

## What Changes

- Reject `pending` and `approved` authorization records with `visibleToHost:
  true` in the shared authorization schema.
- Reject `pending` and `approved` `session-authorization-state` protocol
  messages with `visibleToHost: true`.
- Preserve existing active/paused visibility requirements and terminal
  fail-closed behavior.
- Add focused protocol and authorization tests.
- Update session authorization specs and security docs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-authorization`: pre-active authorization records must not report host
  visible active-session state.
- `session-authorization-protocol`: pre-active state update messages must not
  report host visible active-session state.

## Impact

- Affected code: `packages/protocol/src/authorization.ts`,
  `packages/protocol/src/authorization.test.ts`,
  `packages/protocol/src/messages.ts`,
  `packages/protocol/src/messages.test.ts`.
- Affected docs/specs: `openspec/specs/session-authorization/spec.md`,
  `openspec/specs/session-authorization-protocol/spec.md`,
  `docs/security-model.md`.
- Touches authorization/protocol validation only. It does not add capture, input,
  clipboard, file transfer, installer, startup, service, persistence, or
  privilege behavior.
