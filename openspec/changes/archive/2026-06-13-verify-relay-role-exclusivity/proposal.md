## Why

The relay already enforces a two-party room in `RoomRegistry`, but WebSocket integration coverage only proves duplicate peer-id rejection. We need end-to-end tests showing a second live host or viewer with a different `peerId` is rejected before registration while the original peer remains active.

## What Changes

- Add explicit session-broker scenarios for rejecting a second live peer with the same role in a session.
- Add relay runtime integration-test requirements for second-host and second-viewer join denial, original-peer continuity, and secret-safe denial metadata.
- Implement focused WebSocket integration tests for same-role join rejection.
- No runtime behavior change is intended.
- No breaking changes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-broker`: clarify that same-role live joins are rejected before registration in the two-party room model.
- `relay-runtime`: require end-to-end integration coverage for same-role join rejection and secret-safe denial metadata.

## Impact

- Affected code: `apps/relay/src/server.integration.test.ts`.
- Affected specs: `openspec/specs/session-broker/spec.md` and `openspec/specs/relay-runtime/spec.md`.
- Safety impact: strengthens verification for relay admission controls. It touches relay tests/specs only and does not change screen capture, remote input, clipboard, file transfer, installer behavior, startup persistence, services, privilege elevation, Windows native APIs, token semantics, authentication, authorization grants, or audit schemas.
