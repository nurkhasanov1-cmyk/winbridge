# Tasks

## 1. Authorization State Machine

- [x] 1.1 Reject terminal authorization records that carry permissions.
- [x] 1.2 Clear permissions when authorization is denied, terminated, or expired.
- [x] 1.3 Preserve paused partial revocation and final revocation behavior.

## 2. Tests and Documentation

- [x] 2.1 Add focused tests for terminal permission clearing and schema rejection of terminal records with permissions.
- [x] 2.2 Update `session-authorization` spec and security/architecture docs for terminal states carrying no permissions.

## 3. Verification and Review

- [x] 3.1 Run focused protocol authorization tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Complete security review for authorization terminal-state invariants.
- [x] 3.4 Archive the completed OpenSpec change.
