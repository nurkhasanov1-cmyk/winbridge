## 1. Implementation

- [x] 1.1 Add viewer authorization snapshot tracking for inbound authorization lifecycle messages in the agent shell runtime.
- [x] 1.2 Gate viewer-originated `signal` sends on active, visible, unexpired `screen:view` authorization before socket write and local `sent` event emission.
- [x] 1.3 Keep blocked-send errors and diagnostics secret-safe.
- [x] 1.4 Update architecture, security docs, and the main `agent-shell-consent-workflow` spec with the viewer signal authorization gate.

## 2. Verification

- [x] 2.1 Add focused integration coverage for pre-authorization blocking, active grant allow, revocation/pause/expiration fail-closed behavior, and secret-safe blocked diagnostics.
- [x] 2.2 Run focused agent-shell runtime integration tests for viewer signal authorization gating.
- [x] 2.3 Run security review for the authorization/send-path diff.
- [x] 2.4 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 2.5 Validate and archive the completed OpenSpec change.
