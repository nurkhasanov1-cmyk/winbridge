## 1. Authorization State Machine

- [x] 1.1 Reject pending authorization creation without requested permissions.
- [x] 1.2 Restrict approved grants to a non-empty subset of pending requested permissions.
- [x] 1.3 Reject duplicate granted permissions.

## 2. Tests

- [x] 2.1 Add tests for exact-scope and narrowed-scope approvals.
- [x] 2.2 Add tests for unrequested, empty, duplicate, and empty-request rejection.

## 3. Documentation

- [x] 3.1 Document that host approval can narrow but cannot expand viewer-requested scope.

## 4. Review And Verification

- [x] 4.1 Run security review for authorization grant-scope changes.
- [x] 4.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 4.3 Archive the completed OpenSpec change and verify no active changes remain.
