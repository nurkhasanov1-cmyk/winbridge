## Why

The agent shell already exposes a read-only host status snapshot for visible host-side controls. The viewer runtime also maintains local authorization state, but callers do not have a bounded, read-only API to inspect whether the viewer currently has active, paused, denied, revoked, terminated, expired, or not-yet-authorized access. Future Windows viewer UI needs this state for clear user feedback without sending protocol messages or starting any remote action.

## What Changes

- Add a viewer-only `getViewerStatus()` runtime snapshot API.
- Return bounded lifecycle metadata derived from local viewer authorization state: local state, visible host-session flag, permission count, and optional authorization id/status.
- Reject viewer status calls on host runtimes.
- Verify status reads do not send protocol messages, emit workflow audit events, grant permissions, change authorization lifecycle state, start signaling, or invoke host controls.
- No remote capture, input, clipboard, file transfer, reconnect, installer, service, or persistence behavior is added.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: add viewer-side read-only authorization status snapshots to the managed runtime contract.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`, `apps/agent-shell/src/runtime.integration.test.ts`.
- Affected specs: `openspec/specs/agent-shell-consent-workflow/spec.md`.
- Safety impact: improves local status visibility for viewer-side UI while preserving fail-closed authorization gates. The change is read-only and does not create or approve remote actions.
