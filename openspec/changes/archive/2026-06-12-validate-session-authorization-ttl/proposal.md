## Why

`createPendingSessionAuthorization` accepts caller-provided TTL values that determine how long a pending remote assistance request can move toward approval. Malformed or timer-unsafe TTLs should fail fast before an authorization record is created.

## What Changes

- Validate pending session authorization TTL values as exact bounded integer milliseconds.
- Reject fractional, negative, zero, `NaN`, infinite, or timer-unsafe TTL values before creating pending authorization records.
- Preserve the existing default pending authorization TTL when callers omit `ttlMs`.
- Document the protocol-level TTL bound for consent-bound authorization records.
- Non-goals: no changes to host approval, visible activation, permission scope, revocation, pause/resume, relay behavior, capture/input, installer/startup/service behavior, or production identity.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-authorization`: pending authorization creation must reject malformed or unsafe TTL values before record creation.

## Impact

- Affected code: `packages/protocol/src/authorization.ts`, protocol authorization tests, security documentation, and OpenSpec specs.
- Affected systems: consent-bound session authorization state machine factory.
- Safety impact: prevents accidental long-lived, invalid, or ambiguous pending authorization windows while preserving deny-by-default and host-visible activation requirements.
- Security review: required because this touches authorization lifecycle behavior.
