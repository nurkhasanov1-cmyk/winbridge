## Why

The agent shell already ignores decoded protocol messages for other sessions, but a same-session authorization request that names the local host peer as the viewer can still reach local `received` events and host workflow handling if it is injected by an unexpected relay-like source. The runtime should fail closed locally before any consent workflow side effects.

## What Changes

- Ignore inbound `session-authorization-request` messages when the request's `viewerPeerId` equals the local runtime peer id.
- Perform this check before emitting local `received` protocol events or host authorization workflow decisions, state updates, or audit events.
- Report ignored input only through redacted summary metadata such as byte length.
- Non-goals: no screen capture, input injection, clipboard, file transfer, unattended access, installer, service, startup, privilege, or native Windows behavior changes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: Add a local inbound self-authority boundary for authorization requests before consent workflow handling.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`.
- Affected tests: `apps/agent-shell/src/runtime.integration.test.ts`.
- Affected docs/specs: agent-shell consent workflow documentation and security model.
- Security areas touched: authorization workflow, local runtime events, and logs. No relay, tokens, capture, input, installer, startup, services, or privilege elevation changes.
