# Clear Terminal Authorization Permissions

## Why

The protocol message schema already rejects fail-closed `session-authorization-state` updates that carry permissions. The in-memory authorization record schema is looser: terminal records such as `denied`, `terminated`, or `expired` can still retain a permission list copied from earlier states.

Action checks still fail because terminal status is not `active`, but carrying stale grant scope in terminal records weakens audit clarity and can confuse future native adapters. Terminal authorization records should be unambiguous: no active grant remains.

## What Changes

- Require terminal authorization record states to carry an empty permission list.
- Clear permissions when denying, terminating, or expiring an authorization.
- Preserve paused partial revocation behavior and final revocation behavior.
- Add tests proving terminal states clear stale grants and schema parsing rejects terminal records with permissions.
- Update authorization specs and docs to align record invariants with protocol message invariants.

## Safety Impact

This change touches protocol authorization record invariants and state-machine transitions. It does not add screen capture, input injection, clipboard sync, file transfer, installer behavior, startup persistence, services, networking behavior, tokens, logs beyond existing tests/docs, privilege elevation, or native Windows APIs.

The change is fail-closed: terminal states no longer retain permission scope.

## Non-Goals

- No native Windows UI, capture, input, clipboard, or file-transfer work.
- No relay forwarding changes.
- No production account identity or durable authorization store.
- No change to paused authorization behavior; paused remains grant-bearing but not action-authorizing.

## Modified Capability

- `session-authorization`

