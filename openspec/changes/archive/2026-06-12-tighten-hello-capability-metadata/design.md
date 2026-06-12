## Context

`hello` messages are presence metadata exchanged after pairing or opposite-role presence is observed. Capability strings are not authorization grants, but future clients may use them to decide which UI affordances or protocol paths are available. The existing schema rejects blank capability entries and exact duplicates, while allowing leading or trailing whitespace.

## Goals / Non-Goals

**Goals:**

- Make `hello.capabilities` canonical enough that capability uniqueness cannot be bypassed by surrounding whitespace.
- Preserve existing consent, visibility, authorization, relay forwarding, and agent-shell public-send gates.
- Keep rejection diagnostics bounded and secret-safe.

**Non-Goals:**

- No new capabilities or permission grants.
- No screen capture, input injection, clipboard, file transfer, reconnect, installer, startup, service, privilege, token, or native Windows API changes.
- No production identity or capability negotiation system.

## Decisions

1. Reject untrimmed capability strings at the shared protocol schema.
   - Rationale: shared schema validation is already the boundary used by protocol encoding, relay forwarding, and agent-shell inbound/public-send processing.
   - Alternative considered: trim capability strings during parsing. Rejected because silently changing peer-declared metadata can hide ambiguous input; fail-closed parsing is clearer.

2. Check duplicate capabilities after trimming.
   - Rationale: this directly closes the bypass where `capability` and ` capability ` are visually equivalent but exact-string distinct.
   - Alternative considered: keep exact-string uniqueness and rely on consumers to normalize. Rejected because capability consumers would need to repeat the same security-sensitive normalization.

3. Add relay and agent-shell tests that observe behavior through public boundaries.
   - Rationale: protocol unit tests prove schema behavior, while relay and agent-shell integration tests prove malformed metadata is not forwarded, accepted, or emitted as trusted local events.

## Risks / Trade-offs

- [Risk] A development peer that sends whitespace-padded capability hints will now fail protocol validation. -> Mitigation: this is a malformed metadata contract; generated agent-shell capabilities already use canonical values.
- [Risk] This may look like capability negotiation hardening while the product still lacks production capability negotiation. -> Mitigation: document this as metadata validation only, not authorization or production identity.
