# Design: Defer Agent Shell Hello Until Recipient

## Current Behavior

On socket open, the agent shell sends:

1. `join-session`
2. `hello`

That works only if another peer is already registered. In the normal host-first flow, there is no remaining recipient for `hello`.

## Proposed Behavior

Add session-local hello state:

- `remotePeerDisconnected`
- `helloSent`

The runtime sends:

1. `join-session` on socket open.
2. `hello` once when:
   - a `relay-ready` message has `roomSize >= 2`, or
   - an inbound peer `hello` is received.
3. Viewer authorization requests after the paired-room `relay-ready` handling, preserving explicit requested-permission gating.

If `remotePeerDisconnected` is already recorded, the helper no-ops. This keeps late delayed work fail-closed and avoids sending new workflow messages to a disconnected peer.

## Security Rationale

`hello` is presence metadata only. It must not authorize a session, activate visibility, grant permissions, start capture, inject input, reconnect a peer, or bypass consent. Deferring it reduces unnecessary relay errors without weakening any consent boundary.

The viewer authorization request still requires explicit `requestedPermissions`. The host still sends decisions only with explicit `hostDecision`, and active state still requires explicit visible host state.

## Alternatives Considered

- Keep immediate `hello` and tolerate relay errors: rejected because it creates noisy runtime events and makes host-only startup look like a protocol failure.
- Relax relay recipient enforcement for `hello`: rejected because the relay should keep the stricter registered-recipient invariant for peer-originated messages.

