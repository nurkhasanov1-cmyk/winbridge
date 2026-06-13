## Why

File transfer can expose local documents, source code, logs, credentials stored
in files, and paths that reveal private system state. WinBridge currently has no
file-transfer capability model, host UX, audit contract, data-handling policy,
or implementation, so accepting `file-transfer` as a permission scope creates a
misleading authorization surface.

## What Changes

- Reject `file-transfer` anywhere permission scopes enter shared authorization,
  protocol messages, direct action checks, agent-shell CLI options, or managed
  runtime options.
- Add regression tests proving file transfer cannot be requested, granted,
  restored from state, revoked, or authorized before a dedicated capability
  review.
- Document that file transfer remains unavailable in the current product scope
  and requires a future OpenSpec change plus security review before
  implementation.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-authorization`: require shared authorization validation to reject
  file-transfer permission until a dedicated reviewed capability exists.
- `session-authorization-protocol`: require authorization protocol envelopes to
  reject file-transfer permission in requested, granted, active, revoked, and
  control scopes.
- `agent-shell-consent-workflow`: require CLI and managed runtime validation to
  reject file-transfer permission before relay startup or workflow sends.
- `safety-boundaries`: make file transfer an unavailable sensitive capability
  until explicitly specified and reviewed.

## Impact

- Affected code: `packages/protocol/src/session.ts`,
  `packages/protocol/src/authorization.test.ts`,
  `packages/protocol/src/messages.test.ts`, `apps/agent-shell/src/args.test.ts`,
  `apps/agent-shell/src/runtime.integration.test.ts`, relay fixtures, and docs.
- Safety impact: strengthens deny-by-default behavior for a sensitive data
  movement channel. This touches authorization and protocol validation but does
  not add capture, input, file transfer, clipboard sync, relay routing,
  installer, startup, service, token, log, native Windows API, or
  privilege-elevation behavior.
- Non-goals: no file-transfer feature, no filesystem access, no upload/download
  protocol, no native Windows file picker/API, no UI, no hidden file access, and
  no production data-transfer implementation.
