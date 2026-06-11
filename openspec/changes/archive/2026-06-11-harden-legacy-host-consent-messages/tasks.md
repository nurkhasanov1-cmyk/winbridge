## 1. Legacy Host Consent Schema Hardening

- [x] 1.1 Reject empty or duplicate `host-consent-required` requested permissions.
- [x] 1.2 Reject approved `host-consent-decision` messages with empty or duplicate granted permissions.
- [x] 1.3 Reject denied `host-consent-decision` messages with granted permissions or missing reason.
- [x] 1.4 Reject denied `host-consent-decision` messages with whitespace-only reason.

## 2. Tests

- [x] 2.1 Add protocol tests for valid legacy host consent request and decision messages.
- [x] 2.2 Add protocol tests for malformed legacy host consent request permissions.
- [x] 2.3 Add protocol tests for malformed legacy host consent decision grants and denial reason.
- [x] 2.4 Add protocol test for whitespace-only legacy host consent denial reason.

## 3. Review And Verification

- [x] 3.1 Run security review for legacy host consent message hardening.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Archive the completed OpenSpec change and verify no active changes remain.
