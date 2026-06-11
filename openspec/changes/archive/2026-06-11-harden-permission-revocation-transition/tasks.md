## 1. Authorization State Machine

- [x] 1.1 Guard `revokeSessionPermission` so it only accepts visible unexpired active or paused authorizations.
- [x] 1.2 Reject revocation of permissions that are not currently granted.
- [x] 1.3 Preserve paused state for partial revocation and mark final revocation as terminal `revoked`.

## 2. Tests

- [x] 2.1 Add unit tests for safe active, paused, and final permission revocation transitions.
- [x] 2.2 Add unit tests for pending, approved, denied, expired, terminated, invisible, and missing-permission rejection.

## 3. Documentation

- [x] 3.1 Document permission revocation transition safety in architecture/security docs.

## 4. Review And Verification

- [x] 4.1 Run security review for authorization state-machine changes.
- [x] 4.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 4.3 Archive the completed OpenSpec change and verify no active changes remain.
