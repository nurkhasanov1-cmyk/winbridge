## Why

Audit actors currently allow `deviceId` on every actor type, including `system` and `relay`. That makes device-bound audit attribution ambiguous because infrastructure actors can appear to carry host or viewer device identity.

## What Changes

- Reject audit records where a `system` or `relay` actor includes `deviceId`.
- Continue allowing `deviceId` for `host` and `viewer` actors.
- Add protocol tests for allowed and denied actor/device combinations.
- No remote access capability, capture, input, installer, startup, service, token, or privilege behavior changes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `audit-foundation`: Audit actor validation will constrain `deviceId` to device-bound participant actors.

## Impact

- Affected code: `packages/protocol/src/audit.ts` and audit schema tests.
- Affected systems: shared audit record validation used by development relay, agent shell, audit sinks, and protocol packages.
- Safety impact: strengthens log integrity by preventing relay/system audit records from impersonating host/viewer device attribution.
- Touch areas: logs. Security review is required before completion.
