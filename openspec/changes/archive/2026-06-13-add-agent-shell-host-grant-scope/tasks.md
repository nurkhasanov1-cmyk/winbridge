## 1. CLI And Runtime Implementation

- [x] 1.1 Add `--grant <permission[,permission]>` argument parsing with host-only, approval-source, non-empty, unique permission validation.
- [x] 1.2 Add managed runtime `hostGrantPermissions` validation before relay startup.
- [x] 1.3 Compute effective granted permissions for approved requests and fail closed when configured grants are not a subset of the request.
- [x] 1.4 Use effective granted permissions consistently for decision/state payloads, host snapshots, workflow state, indicator counts, audit counts, expiration, pause/resume, revoke, and signal gates.

## 2. Tests And Documentation

- [x] 2.1 Add CLI argument tests for valid and rejected host grant scope configuration.
- [x] 2.2 Add runtime integration tests for narrowed approval, input-only approval blocking signal authorization, unrequested grant fail-closed behavior, and narrowed-grant revocation eligibility.
- [x] 2.3 Update README, architecture, and security docs for explicit development host grant scope.

## 3. Verification

- [x] 3.1 Run targeted argument and runtime tests covering host grant scope.
- [x] 3.2 Complete security review for grant subset enforcement, signal/revoke gates, audit counts, and fail-closed behavior.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
