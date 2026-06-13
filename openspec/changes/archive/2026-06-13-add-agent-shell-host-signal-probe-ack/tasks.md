## 1. CLI And Runtime Implementation

- [x] 1.1 Add `--host-signal-probe-ack true|false` argument parsing with host-only exact boolean validation.
- [x] 1.2 Add managed runtime option validation for host signal probe acknowledgement configuration before relay startup.
- [x] 1.3 Send one static host acknowledgement per authorization id only after a trusted viewer probe signal.
- [x] 1.4 Ensure acknowledgement failures after pause, revoke, termination, expiration, local disconnect, or remote disconnect are fail-closed and secret-safe.

## 2. Tests And Documentation

- [x] 2.1 Add CLI argument tests for valid and rejected host signal probe acknowledgement configuration.
- [x] 2.2 Add runtime integration tests for successful acknowledgement send, redaction, static payload, and once-per-authorization behavior.
- [x] 2.3 Add runtime integration tests for ignored non-probe signals and lifecycle-loss failure paths.
- [x] 2.4 Update README, architecture, and security docs for the opt-in host signal probe acknowledgement.

## 3. Verification

- [x] 3.1 Run targeted agent-shell argument and runtime integration tests covering the host acknowledgement.
- [x] 3.2 Complete security review for authorization gates, signal payload safety, event redaction, and lifecycle failure paths.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
