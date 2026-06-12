## Why

Terminal authorization states are audit history as well as fail-closed states. Shared protocol helpers should not later rewrite a denied, revoked, terminated, or expired record just because its TTL has passed, and session termination should only apply to a real visible live session.

## What Changes

- Preserve existing terminal authorization states during expiration checks instead of converting them to `expired`.
- Restrict session termination transitions to visible, unexpired `active` or `paused` authorizations.
- Add protocol tests that cover denied, revoked, terminated, and expired lifecycle stability plus unsafe termination attempts.
- Update docs/spec language for terminal lifecycle stability.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-authorization`: terminal authorization lifecycle behavior becomes stable after denial, revocation, termination, or expiration, and termination is constrained to visible live sessions.

## Impact

- Affected area: authentication/authorization protocol helpers in `packages/protocol`.
- API surface: no new exported functions; existing helpers become stricter for unsafe lifecycle inputs.
- Dependencies: none.
- Safety impact: reduces ambiguity in consent and audit history, keeps fail-closed terminal records stable, and prevents termination from manufacturing a live-session lifecycle from non-live states.
- Non-goals: no capture, input, relay, installer, startup, service, token, credential, privilege elevation, stealth, persistence, or Windows prompt behavior changes.
