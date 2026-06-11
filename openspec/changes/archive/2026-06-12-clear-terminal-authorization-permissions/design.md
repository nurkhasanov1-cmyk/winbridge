# Design: Clear Terminal Authorization Permissions

## Current Behavior

`SessionAuthorizationSchema` requires grant-bearing statuses to carry permissions but does not reject permissions on terminal statuses. Some transitions spread the previous record and only change status/timestamps, so stale permissions can remain on:

- `denied`
- `terminated`
- `expired`

`revoked` final-permission transitions already produce an empty permission list.

## Proposed Behavior

Define terminal statuses as:

- `denied`
- `revoked`
- `terminated`
- `expired`

Schema behavior:

```text
if status is terminal and permissions.length > 0:
  reject
```

Transition behavior:

- `denySessionAuthorization()` sets `permissions: []`.
- `terminateSessionAuthorization()` sets `permissions: []`.
- `expireSessionAuthorization()` sets `permissions: []`.
- `revokeSessionPermission()` keeps existing partial revocation behavior and already sets `permissions: []` when final permission is revoked.

## Security Rationale

Terminal authorization states are fail-closed and should not preserve stale grant scope. Clearing permissions makes audit records and future adapters less ambiguous and aligns record invariants with protocol state-update invariants.

This does not authorize any action. It only removes stale scope from terminal records.

## Compatibility

Consumers that expected terminal records to include prior requested or granted permissions must use audit events or lifecycle metadata instead. Current tests and docs treat terminal states as fail-closed, not as grant-bearing.

