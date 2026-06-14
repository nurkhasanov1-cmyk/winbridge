## Why

Consent-bound session grants validate explicit host approval, visible-session requirement, permission scope, and expiration before sensitive action checks use them. The parsed grant object and nested permission array are still mutable, leaving a future adapter or caller able to accidentally widen or weaken the grant after validation.

## What Changes

- Return immutable snapshots from `assertConsentBoundGrant`.
- Freeze the nested grant permission list after schema validation.
- Add regression coverage proving callers cannot mutate grant scope or consent/visibility flags in place.
- Preserve all existing grant validation behavior for expiration, duplicate permissions, unknown fields, and unavailable permission shapes.
- Non-goal: add no new remote action permission, protocol message, relay behavior, capture, input, installer, startup, service, token, logging, or privilege-elevation capability.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-authorization`: consent-bound session grant validation returns immutable grant snapshots.

## Impact

- Affected code: `packages/protocol/src/session.ts` and existing protocol tests that cover session grants.
- API shape remains source-compatible for read-only consumers, but post-validation mutation of returned grants will fail instead of silently changing safety-critical state.
- No dependency, transport, protocol envelope, installer, service, native Windows API, capture, input, persistence, or privilege changes.
