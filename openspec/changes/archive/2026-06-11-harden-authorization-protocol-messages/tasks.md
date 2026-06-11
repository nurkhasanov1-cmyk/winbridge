## 1. Protocol Schema Hardening

- [x] 1.1 Reject duplicate requested permissions in authorization request messages.
- [x] 1.2 Reject approved authorization decision messages with empty or duplicate granted permissions.
- [x] 1.3 Reject authorization state update messages with duplicate permissions.
- [x] 1.4 Require non-empty permissions for approved, active, and paused state updates.
- [x] 1.5 Require empty permissions for pending, denied, revoked, terminated, and expired state updates.

## 2. Tests

- [x] 2.1 Add protocol tests for duplicate requested and granted permissions.
- [x] 2.2 Add protocol tests for approved decision empty grant rejection and denied decision grant rejection.
- [x] 2.3 Add protocol tests for state update grant-bearing and fail-closed permission invariants.
- [x] 2.4 Update affected agent-shell and relay tests if stricter message schemas expose invalid fixtures.

## 3. Review And Verification

- [x] 3.1 Run security review for authorization protocol message hardening.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Archive the completed OpenSpec change and verify no active changes remain.
