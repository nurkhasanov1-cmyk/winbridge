## Why

The CLI parser currently materializes `hostSignalProbeAck: false` even for viewer invocations. Direct runtime validation correctly treats any defined host-signal-probe acknowledgement option as host-only, so the normal viewer CLI handoff can carry an implicit host-only no-op state into runtime creation.

## What Changes

- Omit `hostSignalProbeAck` from parsed viewer arguments when `--host-signal-probe-ack` is not explicitly provided.
- Preserve fail-closed behavior for explicit viewer `--host-signal-probe-ack true` and `--host-signal-probe-ack false`.
- Keep host parsing unchanged: host runtimes may explicitly enable or disable acknowledgement, and the omitted host option remains disabled.
- Add tests proving parsed viewer defaults can be passed to `createAgentShellRuntime()` without host-only rejection while explicit viewer host acknowledgement flags still fail before runtime startup.
- Non-goal: add no new signal payload, authorization approval, capture, input, clipboard, file transfer, diagnostics, reconnect, hidden session, unattended access, installer, startup, service, token, credential, logging sink, or privilege-elevation capability.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: viewer CLI defaults must not materialize host-only acknowledgement state, while explicit viewer host acknowledgement options remain rejected.

## Impact

- Affected code: `apps/agent-shell/src/args.ts`, `apps/agent-shell/src/args.test.ts`, and focused runtime handoff coverage in `apps/agent-shell/src/runtime.integration.test.ts`.
- Affected specs: `openspec/specs/agent-shell-consent-workflow/spec.md`.
- This touches user-visible CLI workflow validation and agent-shell startup only. It does not touch native Windows APIs, relay routing, capture, input, installer behavior, startup persistence, services, tokens, credentials, privilege elevation, or production authorization.
