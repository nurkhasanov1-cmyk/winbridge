## 1. Protocol Lifecycle

- [x] 1.1 Make expiration preserve denied, revoked, terminated, and expired authorization records unchanged.
- [x] 1.2 Restrict session termination to visible, unexpired active or paused authorizations.
- [x] 1.3 Update protocol tests for stable terminal expiration checks and unsafe termination rejection.

## 2. Documentation And Review

- [x] 2.1 Update authorization documentation for terminal lifecycle stability and termination constraints.
- [x] 2.2 Run a focused security review for the authorization lifecycle change.

## 3. Verification

- [x] 3.1 Run focused protocol tests.
- [x] 3.2 Run `npm run check`.
- [x] 3.3 Run `npm test`.
- [x] 3.4 Run `npm run build`.
- [x] 3.5 Run `npm run openspec:validate`.
