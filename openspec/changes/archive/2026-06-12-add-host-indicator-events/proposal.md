## Why

The bootstrap already models host-visible authorization state on the protocol wire, but the non-native host shell does not expose a local indicator state that future Windows UI code can bind to. Adding a secret-safe local indicator event makes host visibility an explicit runtime surface before native capture or input work begins.

## What Changes

- Host runtime emits local `indicator` events when an explicitly approved visible session becomes active.
- Host runtime updates that local indicator for pause, resume, final permission revocation, termination, expiration, local disconnect, runtime stop, socket close, and trusted remote peer disconnect.
- Indicator events carry bounded workflow metadata such as authorization id, status, permission count, and paused/active visibility state, without raw tokens, pairing codes, protocol payloads, private reasons, screen contents, or input contents.
- Indicator updates do not authorize remote actions, start capture, inject input, sync clipboard, transfer files, install services, configure startup persistence, or bypass consent workflows.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: host visible-session lifecycle must expose a local secret-safe indicator event surface that activates only after explicit visible approval and deactivates on fail-closed lifecycle transitions.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`.
- Affected tests: `apps/agent-shell/src/runtime.integration.test.ts`.
- Affected docs/specs: `openspec/specs/agent-shell-consent-workflow/spec.md`, `docs/architecture.md`, `docs/security-model.md`, `README.md`.
- Touches host visible-session workflow events and logs. Does not touch native Windows APIs, screen capture, input injection, clipboard sync, file transfer, relay routing, installer behavior, startup persistence, services, shared tokens, durable production identity, or privilege elevation.
