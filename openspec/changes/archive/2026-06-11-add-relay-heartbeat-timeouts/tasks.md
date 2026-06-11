## 1. Relay Heartbeat Implementation

- [x] 1.1 Add a relay heartbeat helper for env-derived configuration, disabled mode, and liveness timeout state transitions.
- [x] 1.2 Wire heartbeat settings into the managed relay runtime and CLI defaults.
- [x] 1.3 Emit a secret-safe audit event before terminating a peer for heartbeat timeout.

## 2. Tests and Documentation

- [x] 2.1 Add focused unit tests for heartbeat configuration and liveness timeout behavior.
- [x] 2.2 Update relay integration harnesses to inject or disable heartbeat settings where needed.
- [x] 2.3 Document relay heartbeat environment variables and development-only scope.

## 3. Review and Verification

- [x] 3.1 Perform security review for relay/log changes, confirming no capture, input, hidden session, persistence, credential access, or token/payload logging was introduced.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Archive the completed OpenSpec change after implementation and verification.
