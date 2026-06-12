## Context

`signal` messages are the bootstrap stand-in for future media/WebRTC signaling. The relay validates protocol schema and unsafe payload keys before forwarding, while the agent shell additionally checks the signal against active local authorization. The current schema only requires a non-empty bounded payload, so a relay can still forward a signal that lacks lifecycle authorization metadata.

## Goals / Non-Goals

**Goals:**

- Make top-level `payload.authorizationId` mandatory for protocol `signal` messages.
- Validate the field using the same bounded protocol identifier rules as authorization messages.
- Preserve existing payload-size and sensitive-key checks.
- Keep relay rejection reasons bounded and secret-safe.

**Non-Goals:**

- No relay-side authorization state machine or production identity enforcement.
- No native Windows capture/input or WebRTC implementation.
- No change to the agent-shell active-authorization matching gate from the previous increment.

## Decisions

- Enforce at protocol schema level.
  The relay already uses `decodeProtocolEnvelope()` before forwarding, so protocol-level validation gives agents and relay the same fail-closed contract without duplicating checks in relay code.

- Require top-level `authorizationId`.
  Nested authorization identifiers remain safe metadata, but only the top-level field provides a stable binding point for runtime checks and future media signaling conventions.

- Keep rejection generic at the relay boundary.
  Schema validation details may exist locally in tests, but relay-facing errors and audit reasons continue through the bounded `Invalid relay message` path unless a safe policy reason is already known.

## Risks / Trade-offs

- Existing tests and development clients must include `authorizationId` in signal payloads -> update fixtures and docs in this change.
- Relay still cannot prove the id is currently active -> agent/runtime authorization gates remain required, and production auth remains future work.
