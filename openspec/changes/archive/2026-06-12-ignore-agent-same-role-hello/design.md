## Context

`apps/agent-shell` is a non-native protocol exerciser. It does not capture screens, inject input, sync clipboard, transfer files, or run as a background service. It should still fail closed around protocol events that can influence consent and recipient workflow state.

The relay room registry only allows one host and one viewer in a session, and relay forwarding validates `hello.role` against the registered peer. The agent shell should not rely solely on relay behavior when it processes decoded inbound protocol messages from its configured WebSocket endpoint.

## Goals / Non-Goals

**Goals:**

- Treat inbound `hello` with the same role as the local runtime as unsafe for presence.
- Reject that message before local `received` events, before `recipientAvailable` changes, and before `sendHelloOnce()`.
- Keep ignored-message diagnostics limited to redacted byte-length style metadata.
- Preserve existing self-hello, cross-session, foreign `relay-ready`, and opposite-role `hello` behavior.

**Non-Goals:**

- Do not require a pre-known remote peer id for `hello`; authorization state already binds later signal routing.
- Do not alter relay registration or forwarding rules.
- Do not alter protocol schemas.
- Do not add capture, input, clipboard, file transfer, WebRTC, native Windows UI, services, startup persistence, credential access, stealth behavior, or production identity.

## Decisions

1. **Add a local-role `hello` guard near existing unsafe inbound filters.**
   - Running before `received` event emission keeps local observers from treating same-role presence as accepted input.
   - Running before the workflow block prevents `recipientAvailable` and local `hello` sends from being triggered by same-role metadata.

2. **Use the existing ignored unsafe message diagnostic path.**
   - The current helper emits redacted raw metadata and avoids protocol payload fields.
   - Reusing it keeps behavior consistent with self-hello and foreign relay-ready guards.

3. **Keep opposite-role peer `hello` as valid presence evidence.**
   - Host-viewer presence exchange is part of the managed lifecycle.
   - Relay room enforcement remains authoritative in normal development relay flows.

## Risks / Trade-offs

- [Risk] A custom test server that sends same-role `hello` as a generic liveness message will no longer trigger managed presence handling.
  Mitigation: this is intentional; legitimate WinBridge sessions are host-viewer pairs, and tests can send an opposite-role `hello` when they need peer presence.
- [Risk] Future multi-viewer or same-role collaboration would require revisiting this boundary.
  Mitigation: that would be a separate OpenSpec change because it changes the product safety model.
