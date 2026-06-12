## Why

The agent shell treats `peer-disconnected` as relay-observed remote peer lifecycle state and then suppresses later workflow sends. A malformed or relay-like endpoint should not be able to mark the local runtime peer as its own disconnected remote peer.

## What Changes

- Ignore inbound `peer-disconnected` messages when the message `peerId` equals the local runtime peer id.
- Perform this check before emitting local `received` protocol events or recording remote-disconnected state.
- Report ignored input only through redacted summary metadata such as byte length.
- Non-goals: no protocol schema, relay forwarding, reconnect policy, production identity, screen capture, input injection, clipboard, file transfer, unattended access, installer, service, startup, privilege, or native Windows behavior changes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: Add a local inbound self-disconnect boundary before peer disconnect state handling.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`.
- Affected tests: `apps/agent-shell/src/runtime.integration.test.ts`.
- Affected docs/specs: agent-shell consent workflow documentation and security model.
- Security areas touched: relay lifecycle metadata, authorization workflow suppression, local runtime events, and logs. No capture, input, installer, startup, services, tokens, or privilege elevation changes.
