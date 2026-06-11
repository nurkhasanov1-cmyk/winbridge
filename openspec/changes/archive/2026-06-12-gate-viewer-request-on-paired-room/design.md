# Design: Gate Viewer Request On Paired Room

## Behavior

The runtime already handles `relay-ready` before any authorization workflow:

1. Send `hello` once when `roomSize >= 2`.
2. Send a viewer authorization request when explicit requested permissions exist.

The second step should use the same paired-room predicate as `hello`:

```text
if envelope.type == relay-ready && envelope.roomSize >= 2:
  send hello once
  if role == viewer:
    send authorization request when requested permissions are configured
```

If `roomSize < 2`, the runtime records the received event and takes no authorization workflow action.

## Security Rationale

Pairing is a prerequisite to asking for access. A viewer authorization request with no known host recipient is not useful and can create relay errors. Suppressing it fail-closed keeps host consent explicit and avoids treating a one-peer room as ready for authorization.

The request still does not grant access. Host approval, visible active state, permission checks, revocation, timeout, and audit rules remain unchanged.

## Test Strategy

Use a small WebSocket test server that sends a schema-valid viewer `relay-ready` with `roomSize = 1`. The managed runtime should emit the received event, but should not emit a sent `session-authorization-request` event.

