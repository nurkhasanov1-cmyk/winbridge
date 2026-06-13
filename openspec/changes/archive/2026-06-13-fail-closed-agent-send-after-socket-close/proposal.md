## Why

The managed agent shell deactivates the host visible-session indicator when its WebSocket closes, but the public `send()` path only records local disconnected state for the explicit host disconnect simulation. A caller that keeps a runtime object after a transport close can still enter public-send validation before the lower-level socket-open guard rejects the write.

This is already fail-closed for socket delivery, but the lifecycle boundary should be explicit: after local transport close, public sends should fail immediately as local disconnect state, before protocol validation, socket write, or local `sent` event emission.

## What Changes

- Record local peer disconnected state when the agent shell WebSocket close event fires.
- Gate public managed runtime `send()` on that state before message authority, routing, authorization, and recipient checks.
- Add integration coverage proving a post-close public send with private payload markers fails with the bounded local-disconnect error, emits no `sent` event, and does not expose payload contents.
- Sync the `agent-shell-consent-workflow` spec and archive this change after validation.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: public sends fail closed immediately after local socket close and remain secret-safe.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`, agent-shell integration tests, and OpenSpec specs.
- Affected systems: non-native agent shell lifecycle, public send guard order, visible-session indicator safety.
- Safety impact: strengthens consent and visibility boundaries by making local transport closure a first-class terminal send state.
- Non-goals: no reconnect feature, no capture/input implementation, no hidden session behavior, no persistence/startup/service behavior, no credential access, no Windows security prompt bypass, and no production authentication model.
