## 1. Relay Authority Checks

- [x] 1.1 Add registered-peer forwarding assertions for join-only, relay-originated, sender/actor mismatch, and role mismatch cases.
- [x] 1.2 Keep relay error and audit reasons bounded and secret-safe.

## 2. Integration Coverage

- [x] 2.1 Add relay integration tests for post-registration `join-session` replay rejection.
- [x] 2.2 Add relay integration tests for peer-originated `relay-ready` rejection.
- [x] 2.3 Add relay integration tests for spoofed sender/actor rejection.
- [x] 2.4 Add relay integration tests for role-mismatched authorization rejection.

## 3. Docs, Review, and Verification

- [x] 3.1 Update docs and main specs for registered-peer message authority.
- [x] 3.2 Run focused relay tests.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.4 Complete security review for the relay/authorship/audit diff.
- [x] 3.5 Sync and archive the completed OpenSpec change.
