## Why

The host runtime already ignores inbound viewer `signal` messages before visible authorization, but direct host-originated `signal` sends can still be written through the public managed runtime before the host has emitted active visible `screen:view` authorization. Gating host sends closes the remaining local signaling setup path so future transport work stays tied to explicit host consent and visible session state.

## What Changes

- Block host-originated public runtime `signal` sends before socket write and local `sent` event emission unless the host runtime has locally emitted active, visible, unexpired authorization granting `screen:view`.
- Reuse the existing signal authorization check and redacted blocked-send behavior.
- Add integration tests for pre-authorization, post-authorization, post-pause/revoke/termination/expiration, and restart fail-closed host send behavior.
- Safety non-goals: no screen capture, input injection, clipboard, file transfer, installer, startup persistence, service behavior, privilege elevation, hidden sessions, or Windows security prompt bypass.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: host-originated public runtime `signal` sends must be gated by local active visible `screen:view` authorization.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`.
- Affected tests: `apps/agent-shell/src/runtime.integration.test.ts`.
- Affected docs/specs: `openspec/specs/agent-shell-consent-workflow/spec.md`, `docs/architecture.md`, `docs/security-model.md`.
- Touches auth and local event/log behavior; does not touch relay, protocol schema, capture, input, installer, startup, services, tokens, or privilege elevation.
