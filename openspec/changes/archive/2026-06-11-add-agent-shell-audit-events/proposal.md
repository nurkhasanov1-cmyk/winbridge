## Why

The agent shell exercises consent and revocation protocol flows, but it does not yet emit development audit-event messages for host decisions and revocations. Future Windows adapters need these audit touchpoints modeled before remote actions exist.

## What Changes

- Emit protocol `audit-event` messages from the host shell for approval, denial, visible activation, and permission revocation simulation.
- Keep audit event details secret-safe and limited to counts, booleans, status, and permission identifiers.
- Add integration tests proving audit events are forwarded through the relay and do not contain raw pairing codes, tokens, credentials, or signal payloads.
- Document that these are development protocol audit events, not production audit persistence.
- Safety impact: this touches agent-shell consent workflow and audit protocol usage. It does not add capture, input, clipboard, file transfer, installer, startup, service, credential access, token disclosure, privilege elevation, or hidden access.

## Capabilities

### New Capabilities

### Modified Capabilities
- `agent-shell-consent-workflow`: Host shell emits secret-safe development audit-event messages for consent and revocation workflow events.

## Impact

- `apps/agent-shell`: host decision, active state, revoke simulation, and integration tests.
- `packages/protocol`: no schema changes expected; existing `audit-event` message is reused.
- `docs`: clarify development audit-event scope.
