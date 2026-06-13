## 1. Specification Readiness

- [x] 1.1 Validate the OpenSpec change strictly before implementation.

## 2. Runtime Implementation

- [x] 2.1 Add a viewer-side guard that rejects same-authorization decisions after a terminal snapshot from the same observed host authority.
- [x] 2.2 Preserve new authorization id behavior as a new consent scope from the observed host.

## 3. Tests

- [x] 3.1 Add integration coverage for denied same-id decision replay.
- [x] 3.2 Add integration coverage for revoked, terminated, and expired same-id decision replay.
- [x] 3.3 Add integration coverage proving a different authorization id remains a new consent scope.
- [x] 3.4 Verify replay diagnostics remain secret-safe.

## 4. Verification and Review

- [x] 4.1 Run focused agent-shell integration tests for terminal decision replay.
- [x] 4.2 Run `npm run check`.
- [x] 4.3 Run `npm test`.
- [x] 4.4 Run `npm run build`.
- [x] 4.5 Run `npm run openspec:validate`.
- [x] 4.6 Complete a security review for authorization and revocation handling.
