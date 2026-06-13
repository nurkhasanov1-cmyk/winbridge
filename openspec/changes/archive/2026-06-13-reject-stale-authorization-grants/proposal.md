## Why

The authorization state model rejects grants whose expiration is not after creation, but protocol messages can still carry approved decisions or live state updates whose `expiresAt` is already at or before message `createdAt`. Those stale grant-bearing envelopes are ambiguous and should fail closed before forwarding or processing.

## What Changes

- Reject approved `session-authorization-decision` messages when `expiresAt <= createdAt`.
- Reject grant-bearing live `session-authorization-state` messages (`approved`, `active`, `paused`) when `expiresAt <= createdAt`.
- Preserve fail-closed terminal state updates, especially `expired`, where `expiresAt` can legitimately be in the past relative to the notification message.
- Add focused protocol tests for stale approved decisions, stale live states, and preserved expired state updates.
- No capture, input, relay routing, installer, startup, service, token, log persistence, or privilege behavior changes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-authorization-protocol`: Authorization decision and state update validation will reject stale grant-bearing envelopes.

## Impact

- Affected code: `packages/protocol/src/messages.ts` and protocol message tests.
- Affected systems: protocol validation used by relay and agent-shell before forwarding or processing authorization messages.
- Safety impact: prevents already-expired grants from being represented as approved, active, or paused access.
- Touch areas: auth/protocol validation. Security review is required before completion.
