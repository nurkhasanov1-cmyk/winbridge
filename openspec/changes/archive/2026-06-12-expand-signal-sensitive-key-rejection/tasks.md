## 1. Protocol Validation

- [x] 1.1 Expand `signal` payload sensitive-key detection for API keys, authorization/auth headers, cookies, and private keys while preserving `authorizationId`.
- [x] 1.2 Add protocol tests for expanded sensitive-key rejection and accepted lifecycle identifiers.

## 2. Relay Boundary

- [x] 2.1 Add or update relay integration coverage proving expanded unsafe `signal` payload keys are rejected before forwarding.
- [x] 2.2 Confirm relay rejection audit metadata remains secret-safe for the expanded key set.

## 3. Documentation and Verification

- [x] 3.1 Update security documentation for the expanded `signal` payload boundary.
- [x] 3.2 Run focused protocol and relay tests.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.4 Complete security review for the protocol/relay/log safety diff.
- [x] 3.5 Sync and archive the completed OpenSpec change.
