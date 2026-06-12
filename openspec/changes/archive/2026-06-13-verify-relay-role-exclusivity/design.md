## Context

`RoomRegistry` already rejects a second live peer with the same role in a development session, and existing unit tests cover that rule. The relay integration suite verifies duplicate peer-id rejection over WebSocket, but it does not yet prove that a different `peerId` with an already-occupied role is denied before registration and without disturbing the original peer.

## Goals / Non-Goals

**Goals:**

- Add WebSocket integration coverage for second-host and second-viewer join rejection.
- Verify the denial is bounded and secret-safe.
- Verify the original registered peer remains active after the denial.
- Keep the relay two-party model explicit in OpenSpec.

**Non-Goals:**

- No runtime behavior changes.
- No multi-viewer or multi-host semantics.
- No reconnect semantics.
- No changes to screen capture, remote input, clipboard, file transfer, installer behavior, startup persistence, services, privilege elevation, Windows native APIs, token matching, authentication, authorization grants, or audit schemas.

## Decisions

1. Add integration tests instead of changing `RoomRegistry`.
   - Rationale: the desired behavior already exists in the registry. The gap is end-to-end coverage across protocol decoding, first-message registration, relay-error emission, audit denial, and subsequent forwarding continuity.
   - Alternative considered: refactor join admission. Rejected because no behavior bug has been observed and refactoring would expand risk without improving the current contract.

2. Assert original-peer continuity with a forwarded `signal`.
   - Rationale: checking only a relay-error could miss accidental peer replacement. A post-denial message forwarded to the original peer proves the denied socket did not become registered.
   - Alternative considered: inspect internal room state. Rejected because the managed runtime intentionally exposes behavior through WebSocket and audit hooks.

3. Keep denial diagnostics bounded.
   - Rationale: same-role denial messages include role/session metadata but must not expose pairing credentials or raw payload content.
   - Alternative considered: assert exact full audit object shape. Rejected because existing audit detail already provides bounded pairing classification; the tests should focus on admission and secrecy invariants.

## Risks / Trade-offs

- [Risk] Integration tests can be slower than unit tests. -> Mitigation: add two focused cases using existing helper functions and run the targeted relay integration suite.
- [Risk] The same-role denial reason includes session id. -> Mitigation: the session id is bounded protocol metadata, while tests assert pairing credentials are absent from peer-facing errors and audit records.
