## Context

The development relay uses host-created pairing tickets to gate viewer joins. Pairing config controls ticket TTL and maximum uses. Existing validation rejects malformed values before runtime startup or ticket creation, and `RoomRegistry` copies normalized values into internal state.

The remaining gap is object mutability at the normalization boundary. A caller can mutate the object returned by `normalizeRelayPairingConfig()`, which weakens the expectation that normalized configuration is a stable safety boundary.

## Goals / Non-Goals

**Goals:**

- Return a fresh immutable pairing config snapshot from normalization.
- Keep `RoomRegistry` using its own validated internal snapshot.
- Add regression tests for normalized object immutability and caller object mutation after registry construction.
- Preserve current pairing ticket behavior and test clock support.

**Non-Goals:**

- No changes to pairing code generation or hashing.
- No multi-viewer semantics or reconnect behavior.
- No native capture, input, clipboard, file-transfer, diagnostics, installer, startup, service, token, authorization, logging, or privilege changes.

## Decisions

1. Freeze the normalized config object.

   `normalizeRelayPairingConfig()` will continue validating TTL and maximum uses and returning a fresh object. The returned object will be frozen so consumers cannot mutate validated TTL or maximum-use fields without crossing a new validation boundary.

2. Preserve the injected `now` function reference.

   The test clock remains intentionally injectable. Freezing the config prevents replacing the `now` function on the normalized object, but does not prevent the function itself from reading caller-owned test time state.

3. Keep registry-level validation.

   `RoomRegistry` already calls `normalizeRelayPairingConfig()` and copies values into internal state. This remains the central protection for direct registry callers and for `createRelayRuntime({ pairing })`.

## Risks / Trade-offs

- Callers that expected to mutate a normalized config object will need to create a new config and pass it through validation again. This is acceptable because normalization is a validation boundary.
- The function reference for `now` can still observe external mutable test state by design. This preserves deterministic expiration tests and does not let callers mutate TTL or max-use bounds after validation.
