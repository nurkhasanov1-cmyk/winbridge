## Why

The agent shell emits local `received` events for inbound authorization lifecycle and audit workflow messages. A malformed or relay-like endpoint should not be able to surface authority messages that identify the local runtime peer as the authority actor, because inbound authority should originate from a distinct remote peer.

## What Changes

- Ignore inbound `session-authorization-decision` messages when `hostPeerId` equals the local runtime peer id.
- Ignore inbound `session-authorization-state`, `session-control`, `permission-revoked`, and `audit-event` messages when `actorPeerId` equals the local runtime peer id.
- Perform these checks before emitting local `received` protocol events or logging received workflow summaries.
- Report ignored input only through redacted summary metadata such as byte length.
- Non-goals: no protocol schema, relay forwarding, authorization state-machine change, screen capture, input injection, clipboard, file transfer, unattended access, installer, service, startup, privilege, or native Windows behavior changes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: Add a local inbound workflow self-authority boundary before authorization lifecycle and audit workflow event handling.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`.
- Affected tests: `apps/agent-shell/src/runtime.integration.test.ts`.
- Affected docs/specs: agent-shell consent workflow documentation and security model.
- Security areas touched: authorization lifecycle metadata, audit workflow metadata, local runtime events, and logs. No capture, input, relay, installer, startup, services, tokens, or privilege elevation changes.
