## 1. CLI And Runtime Implementation

- [x] 1.1 Add `--viewer-signal-probe-after-ms <delay>` argument parsing with viewer-only, exact integer, safe timer bound, and `screen:view` request validation.
- [x] 1.2 Add managed runtime option validation for viewer signal probe configuration before relay startup.
- [x] 1.3 Schedule one viewer signal probe only after active visible `screen:view` authorization and send it through public runtime `send()`.
- [x] 1.4 Ensure probe failures after pause, revoke, termination, expiration, local disconnect, or remote disconnect are fail-closed and secret-safe.

## 2. Tests And Documentation

- [x] 2.1 Add CLI argument tests for valid and rejected viewer signal probe configuration.
- [x] 2.2 Add runtime integration tests for successful authorized probe send and event redaction.
- [x] 2.3 Add runtime integration tests for withheld or skipped probe behavior before authorization and after lifecycle loss.
- [x] 2.4 Update README, architecture, and security docs for the viewer-only development signal probe.

## 3. Verification

- [x] 3.1 Run targeted agent-shell argument and runtime integration tests covering the signal probe.
- [x] 3.2 Complete security review for authorization gates, signal payload safety, event redaction, and lifecycle failure paths.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
