## Why

Clipboard access can expose copied credentials, recovery codes, private text,
screenshots, or file paths. WinBridge currently has no clipboard capability
model, host UX, data-handling policy, or audit contract, so clipboard
permissions must fail closed until a dedicated capability review defines them.

## What Changes

- Reject `clipboard:read` and `clipboard:write` anywhere permission scopes enter
  the shared authorization state machine, protocol messages, direct action
  checks, agent-shell CLI, or managed runtime options.
- Add regression tests proving clipboard permissions cannot be requested,
  granted, restored from state, revoked, or authorized.
- Document that clipboard access is unavailable in the current product scope and
  requires a future OpenSpec change plus security review before implementation.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-authorization`: require shared authorization validation to reject
  clipboard permissions until a dedicated reviewed capability exists.
- `session-authorization-protocol`: require authorization protocol envelopes to
  reject clipboard permissions in requested, granted, active, revoked, and
  control scopes.
- `agent-shell-consent-workflow`: require CLI and managed runtime validation to
  reject clipboard permissions before relay startup or workflow sends.
- `safety-boundaries`: make clipboard access an unavailable sensitive
  capability until explicitly specified and reviewed.

## Impact

- Affected code: `packages/protocol/src/session.ts`,
  `packages/protocol/src/authorization.test.ts`,
  `packages/protocol/src/messages.test.ts`, `apps/agent-shell/src/args.test.ts`,
  `apps/agent-shell/src/runtime.integration.test.ts`, and docs.
- Safety impact: strengthens deny-by-default behavior for a sensitive data
  channel. This touches authorization and protocol validation but does not add
  capture, input, clipboard sync, file transfer, relay routing, installer,
  startup, service, token, log, native Windows API, or privilege-elevation
  behavior.
- Non-goals: no clipboard feature, no clipboard permission model, no native
  Windows clipboard APIs, no UI, no hidden data access, and no production
  synchronization implementation.
