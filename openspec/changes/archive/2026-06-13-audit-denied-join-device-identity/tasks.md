## 1. Relay Denial Audit Metadata

- [x] 1.1 Add bounded attempted device identity detail to denied relay join audit records after protocol validation and before registration.
- [x] 1.2 Redact attempted `deviceId` metadata when it contains the submitted pairing code.

## 2. Tests

- [x] 2.1 Add relay integration coverage for denied viewer joins with safe attempted device identity metadata.
- [x] 2.2 Add relay integration coverage proving denied `deviceId` values containing the pairing code are redacted and remain non-authorizing.

## 3. Review And Verification

- [x] 3.1 Run targeted relay tests for denied join device identity audit behavior.
- [x] 3.2 Run security review for relay/audit/log changes.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.4 Archive the completed OpenSpec change after implementation and verification.
