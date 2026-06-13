## Why

Viewer status can remain shaped like an active visible authorization after the local viewer WebSocket closes unexpectedly, because local close state is tracked separately from the status snapshot. A disconnected viewer must not present action-capable status metadata as active.

## What Changes

- Report viewer status as inactive after a local viewer socket close that is not an explicit local leave and not a trusted remote host disconnect.
- Add bounded local inactive cause metadata for this path: `localInactiveCause=socket-closed`.
- Clear connection-scoped viewer authorization metadata for local socket close status, so stale authorization id/status are not shown as current local capability.
- Preserve existing behavior for explicit viewer leave, ordinary `stop()`, and trusted remote host disconnect.
- Keep the change local-only; it does not alter protocol messages, relay routing, audit payloads, reconnect behavior, capture, input, clipboard, files, installer, services, tokens, logs, or privileges.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-shell-consent-workflow`: Viewer status fails closed after local viewer socket close.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`, `apps/agent-shell/src/viewer-status.ts`, focused agent-shell tests.
- Affected docs/specs: viewer status requirements in `agent-shell-consent-workflow`, README/security model status text.
- Safety impact: strengthens viewer-side local status after transport loss. It does not touch capture, input, auth authority, relay behavior, installer, startup, services, tokens, logs, or privilege elevation.
