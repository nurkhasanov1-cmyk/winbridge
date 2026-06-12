## 1. Integration Coverage

- [x] 1.1 Add a WebSocket integration test that rejects a second live host with a different `peerId` before registration.
- [x] 1.2 Add a WebSocket integration test that rejects a second live viewer with a different `peerId` before registration.
- [x] 1.3 Verify same-role denial metadata remains secret-safe and the original peer remains active.

## 2. Specs and Verification

- [x] 2.1 Sync main `session-broker` and `relay-runtime` specs with same-role join rejection coverage.
- [x] 2.2 Run focused relay integration tests.
- [x] 2.3 Run strict OpenSpec validation for `verify-relay-role-exclusivity`.
- [x] 2.4 Run `npm run verify`.
- [x] 2.5 Perform a security review of relay role-exclusivity tests, denial metadata, continuity checks, and OpenSpec impact.
