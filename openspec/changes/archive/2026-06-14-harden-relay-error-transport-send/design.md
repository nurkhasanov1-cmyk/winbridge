## Context

The relay rejects malformed, unauthorized, and stale peer messages by auditing the rejection, applying invalid-message rate-limit accounting, sending a bounded `relay-error`, and sometimes closing the sender after the limit is exceeded.

The audit and rate-limit steps are required security behavior. The peer-facing `relay-error` is useful diagnostics, but it depends on WebSocket transport state. If a socket transitions to closing during rejection handling, an unconditional send can throw after the relay has already identified a safe denial path.

## Goals / Non-Goals

**Goals:**

- Keep rejection audit and invalid-message rate-limit accounting mandatory.
- Make `relay-error` transport delivery best-effort and safe when the sender socket is not open.
- Preserve the current canonical bounded `relay-error` body whenever it can be delivered.
- Add focused integration coverage for the closed-socket rejection race.

**Non-Goals:**

- No change to room membership, pairing, token validation, heartbeat semantics, or authorization decisions.
- No retry queue or guaranteed peer-facing error delivery after transport close.
- No production distributed abuse protection.
- No capture, input, clipboard, file-transfer, diagnostics, installer, startup, service, credential, token, privilege, hidden-session, or consent changes.

## Decisions

1. Add a local relay-error send helper.

   The helper will check `socket.readyState === WebSocket.OPEN` before sending and will swallow send failures. This keeps peer-facing diagnostics opportunistic while preventing transport races from escaping the rejection handler.

   Alternative considered: wrap the whole rejection handler in a broad outer try/catch. That would hide where the optional transport boundary is and could accidentally mask audit-sink failures, which should still surface in tests and startup workflows.

2. Audit and rate-limit before best-effort transport delivery.

   The rejection handler will continue to calculate the safe reason, consume the invalid-message limiter, and write the rejection audit before attempting to send `relay-error`.

   Alternative considered: attempt relay-error first to preserve current observed order. That would keep the transport write on the critical path for mandatory abuse accounting, which is the problem this change fixes.

## Risks / Trade-offs

- **Risk: Some closing peers no longer receive a `relay-error`.** -> Mitigation: this can only happen when the socket is already unavailable; audit and close behavior remain authoritative.
- **Risk: Send failures are swallowed.** -> Mitigation: only the optional peer-facing relay-error write is swallowed. Audit writes and rate-limit decisions remain visible to tests and callers.
