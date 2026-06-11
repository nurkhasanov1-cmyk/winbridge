## Why

Session authorization helper functions enforce consent and grant-scope invariants, but the shared schema can still parse externally constructed authorization records with unsafe combinations such as active sessions without host visibility or approved grants with duplicate permissions. Hardening the schema closes that gap for records loaded from storage, APIs, or tests before they reach action authorization.

## What Changes

- Add schema-level validation for lifecycle-specific session authorization invariants.
- Reject duplicate permissions for all authorization records.
- Reject non-terminal grant-bearing states without at least one permission.
- Require host-visible state for `active` and `paused` authorizations.
- Require lifecycle timestamps that correspond to approved, active, paused, resumed, revoked, terminated, and expired states.
- Keep revocation able to represent an empty grant only when the authorization is already `revoked`.
- Non-goals: no new capture, input, relay, installer, startup, service, token, privilege elevation, or native Windows behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-authorization`: add schema-level authorization record invariants for visibility, permissions, lifecycle timestamps, and fail-closed malformed states.

## Impact

- Affected code: `packages/protocol/src/authorization.ts`, `packages/protocol/src/authorization.test.ts`.
- Affected docs/specs: `openspec/specs/session-authorization/spec.md` through this delta.
- Safety impact: strengthens auth parsing and external-record rejection; does not add remote access capability.
