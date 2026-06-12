## Context

The non-native agent shell records `peer-disconnected` as remote peer disconnected state. Once that state is set, delayed host workflow simulations and direct managed runtime sends fail closed. The relay is expected to send disconnect notices for the other peer in the room, but the agent shell can also be exercised against tests, tools, or unexpected relay-like endpoints.

The runtime should not let a same-session `peer-disconnected` message naming the local peer mark the local runtime as if its remote peer disconnected.

## Goals / Non-Goals

**Goals:**

- Ignore decoded inbound `peer-disconnected` messages whose `peerId` equals the local runtime `peerId`.
- Run the check before local `received` protocol event emission, receive logging, or remote-disconnected state updates.
- Keep ignored-message diagnostics secret-safe by exposing only redacted summary metadata such as byte length.
- Preserve normal remote peer disconnect handling for notices naming the other peer.

**Non-Goals:**

- No protocol schema, relay behavior, reconnect policy, production identity, token lifecycle, capture, input, clipboard, file transfer, installer, service, startup, privilege, or native Windows behavior changes.
- No replacement for relay-side rejection of peer-originated disconnect notices.

## Decisions

- Add a local self-disconnect guard after protocol decoding and session matching, before received-event emission.
  - Rationale: `peerId` can be inspected only after decoding, and the guard must run before the runtime records remote-disconnected state or logs a disconnect summary.
  - Alternative considered: accept any same-session disconnect notice and rely on the relay. Rejected because the managed runtime should fail closed when exercised against an unexpected relay-like source.
- Reuse the unsafe inbound protocol redaction path for ignored self-disconnect notices.
  - Rationale: ignored lifecycle metadata should not expose peer ids, session ids, message type, tokens, or payload fragments in local events/logs.
  - Alternative considered: emit a specific local disconnect mismatch diagnostic. Rejected because generic byte-length diagnostics are sufficient and safer.

## Risks / Trade-offs

- A misconfigured relay that sends a self-disconnect notice will no longer suppress local sends. -> Mitigation: a self-disconnect notice is not valid remote peer lifecycle state; normal socket close handling still stops the runtime.
- Generic ignored-message diagnostics reduce debugging detail. -> Mitigation: byte length remains available while preserving secret-safe logging.
