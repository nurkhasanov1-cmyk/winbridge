## 1. Spec Updates

- [x] 1.1 Update audit-foundation requirements for unsafe audit detail key rejection.
- [x] 1.2 Update relay runtime requirements for malformed protocol audit-event detail key rejection.

## 2. Implementation

- [x] 2.1 Harden audit detail key validation recursively.
- [x] 2.2 Update docs describing audit detail key constraints.

## 3. Regression Tests

- [x] 3.1 Add audit record tests for unsafe detail keys and secret-safe diagnostics.
- [x] 3.2 Add protocol audit-event detail key tests for parse/encode and secret-safe diagnostics.
- [x] 3.3 Add relay integration coverage proving malformed audit-event detail key metadata is rejected before forwarding and without raw key leakage.

## 4. Verification And Review

- [x] 4.1 Run focused audit, protocol, and relay tests.
- [x] 4.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 4.3 Complete security review for audit/log/protocol/relay metadata handling and resolve findings.
- [x] 4.4 Sync implemented requirements into main specs.
- [x] 4.5 Archive the OpenSpec change after implementation and validation.
