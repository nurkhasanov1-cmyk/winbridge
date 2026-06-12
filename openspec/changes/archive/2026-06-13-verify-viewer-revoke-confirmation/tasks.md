## 1. Integration Coverage

- [x] 1.1 Add an agent-shell integration test where a viewer receives active authorization, a bound revoke-permission `session-control`, and a follow-up same-authority `permission-revoked` confirmation.
- [x] 1.2 Verify the follow-up `permission-revoked` confirmation is emitted as a local redacted `received` event.
- [x] 1.3 Verify viewer signal sends remain rejected after the confirmation before socket write and local `sent` event emission.
- [x] 1.4 Verify local events and logs omit the raw revoke confirmation reason marker.

## 2. Specs and Verification

- [x] 2.1 Sync main `agent-shell-consent-workflow` spec with revoke confirmation coverage.
- [x] 2.2 Run focused agent-shell integration tests for the revoke confirmation path.
- [x] 2.3 Run strict OpenSpec validation for `verify-viewer-revoke-confirmation`.
- [x] 2.4 Run `npm run verify`.
- [x] 2.5 Perform a security review of revoke confirmation assertions, fail-closed signal checks, leakage checks, and OpenSpec impact.
