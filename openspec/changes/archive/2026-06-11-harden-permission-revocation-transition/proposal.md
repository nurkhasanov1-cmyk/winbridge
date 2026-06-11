## Why

The shared authorization state machine currently removes permissions through `revokeSessionPermission` without first requiring an active or paused visible authorization. Although remote action checks still fail closed for non-active states, revocation is a host session-control operation and should not mutate pending, denied, approved-but-invisible, terminated, or expired authorization records.

Tightening this transition makes future native adapters inherit a clearer fail-closed contract before screen capture or input exists.

## What Changes

- Restrict permission revocation to visible, unexpired `active` or `paused` authorizations.
- Reject revocation for pending, approved, denied, revoked, terminated, expired, invisible, or missing-permission states.
- Preserve paused state after partial permission revocation and mark the authorization `revoked` only when the final grant is removed.
- Add focused state-machine tests for safe and unsafe revocation transitions.
- Document the permission revocation transition boundary.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-authorization`: Hardens the permission revocation transition in the shared authorization state machine.

## Impact

- Affected code: `packages/protocol/src/authorization.ts`, authorization tests, docs, and OpenSpec specs.
- Safety impact: strengthens host-controlled revocation semantics without adding remote action capability.
- Touches authorization behavior; requires security review.
- Non-goals: screen capture, input injection, clipboard sync, file transfer, reconnect, relay behavior, installer behavior, services, startup persistence, credential access, privilege elevation, hidden sessions, or Windows prompt bypass.
