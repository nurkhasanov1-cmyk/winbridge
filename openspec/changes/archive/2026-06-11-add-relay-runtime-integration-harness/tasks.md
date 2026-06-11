## 1. OpenSpec

- [x] 1.1 Add proposal, design, relay-runtime spec, and tasks.
- [x] 1.2 Validate the OpenSpec change in strict mode.

## 2. Relay Runtime

- [x] 2.1 Add `createRelayRuntime` with explicit start/stop lifecycle and test injection points.
- [x] 2.2 Replace relay CLI entrypoint with a thin runtime wrapper.
- [x] 2.3 Preserve existing environment-derived relay configuration.

## 3. Integration Tests

- [x] 3.1 Test host/viewer join and relay-ready messages over WebSocket.
- [x] 3.2 Test protocol message forwarding over WebSocket.
- [x] 3.3 Test pairing mismatch rejection and invalid-token audit.
- [x] 3.4 Test invalid-message rate-limit closure.

## 4. Docs and Verification

- [x] 4.1 Update architecture docs with relay runtime notes.
- [x] 4.2 Run typecheck, tests, build, and strict OpenSpec validation.
- [x] 4.3 Archive the completed OpenSpec change.
- [x] 4.4 Commit and push the completed increment.
