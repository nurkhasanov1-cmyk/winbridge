## Why

Session authorization records already reject lifecycle timestamps outside the record window, but they do not explicitly reject every impossible ordering between lifecycle events. Tightening that schema guard prevents imported or persisted records from implying approval, activation, pause, resume, revoke, termination, or expiration history that could not happen in the consent-first state machine.

## What Changes

- Reject authorization records whose approval timestamp is after activation, pause, resume, revocation, termination, or expiration timestamps.
- Reject paused/resumed authorization histories where pause and resume timestamps are out of order.
- Reject terminal lifecycle timestamps that appear before prerequisite approval or activation timestamps.
- Preserve the existing deny-by-default authorization behavior; this change only rejects malformed records earlier.
- Non-goals: no native capture, input injection, hidden session behavior, installer/startup behavior, relay routing changes, credential handling, or production account system.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-authorization`: tighten schema-level authorization record invariants for lifecycle timestamp ordering.

## Impact

- Affected code: `packages/protocol/src/authorization.ts` and focused protocol tests.
- Affected specs: `openspec/specs/session-authorization/spec.md`.
- Security impact: touches authorization validation and therefore requires focused security review before release.
- No dependency, API shape, relay, token, log, installer, service, startup, privilege, capture, or input changes.
