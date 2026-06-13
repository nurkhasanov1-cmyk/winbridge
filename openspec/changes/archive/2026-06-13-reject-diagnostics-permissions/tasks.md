## 1. Protocol Coverage

- [x] 1.1 Add authorization state-machine coverage rejecting `diagnostics:view` in requested, granted, parsed, grant, revocation, and action-check scopes.
- [x] 1.2 Add protocol message coverage rejecting `diagnostics:view` in request, decision, state, permission-revoked, and session-control permission fields.

## 2. Documentation and Review

- [x] 2.1 Update security documentation to state diagnostics permissions are unavailable until a dedicated OpenSpec change and security review.
- [x] 2.2 Review the diff for fail-open diagnostics access, capture/input side effects, raw diagnostic data exposure, and skipped or weakened authorization checks.

## 3. Verification

- [x] 3.1 Run focused protocol tests for authorization and message schema coverage.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
