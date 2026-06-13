## Why

Future Windows viewer UI needs a simple way for the viewer to leave a remote assistance session. The non-native shell can already exercise host-side local disconnect, but there is no viewer-side development path that closes only the viewer's local relay connection and verifies relay-observed disconnect behavior.

## What Changes

- Add an opt-in viewer CLI option that schedules a local viewer disconnect after a bounded delay.
- Keep the option viewer-only and validate exact integer millisecond values before runtime startup.
- Implement the disconnect by stopping the local viewer runtime instead of constructing protocol messages or invoking host lifecycle controls.
- Verify that the relay, not the viewer, sends any `peer-disconnected` notice to the remaining host.
- Document the viewer disconnect option and its safety boundaries.
- No screen capture, input injection, clipboard sync, file transfer, diagnostics collection, reconnect, production viewer UI, authentication, relay authorization, token handling, installer/startup/service behavior, or privilege elevation changes are included.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: adds viewer CLI validation and local disconnect behavior for closing the viewer's own relay connection.

## Impact

- Affected code: `apps/agent-shell/src/args.ts`, `apps/agent-shell/src/index.ts`, and a small viewer disconnect CLI helper with focused tests.
- Affected docs: README and relevant architecture/security notes.
- Runtime/API impact: no new protocol envelope and no expansion of public host lifecycle controls. The existing `runtime.stop()` local shutdown path is reused.
- Safety impact: the feature is local viewer shutdown only. It must not grant permissions, start capture, send input, send forged disconnect notices, emit workflow audit events, invoke host controls, hide host visibility, or bypass consent workflows.
