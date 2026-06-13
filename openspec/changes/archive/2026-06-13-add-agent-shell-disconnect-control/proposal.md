## Why

The agent shell already simulates a host-local disconnect after visible activation, but that safety-critical lifecycle does not have its own auditable event and there is no direct managed-runtime control for a future host UI disconnect button. Adding a local disconnect control closes this gap while keeping disconnect visible, host-initiated, and relay-notified.

## What Changes

- Add a managed agent-shell `disconnect()` control that a host UI can call after explicit visible activation to immediately close the local relay connection.
- Reuse the same local-disconnect path for the existing delayed host disconnect simulation.
- Emit and persist a secret-safe `agent-shell.session.disconnected` development audit event for local host disconnects when an audit sink is configured.
- Ensure audit sink failures are surfaced through sanitized runtime diagnostics but never delay or prevent host indicator deactivation or WebSocket close.
- Preserve relay authority for `peer-disconnected`; the agent shell still MUST NOT forge peer disconnect notices.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: Adds direct local host disconnect control behavior and audit requirements for local disconnect lifecycle.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`, `apps/agent-shell/src/runtime.integration.test.ts`.
- Affected docs/specs: `openspec/specs/agent-shell-consent-workflow/spec.md`, `docs/architecture.md`, `docs/security-model.md`.
- Affected surfaces: authorization lifecycle, visible host indicator, local audit logging, public runtime API.
- Not affected: screen capture, input injection, clipboard, file transfer, diagnostics collection, installer behavior, startup persistence, background services, native Windows APIs, relay routing, tokens, or privilege elevation.
