## 1. Shared Helper

- [x] 1.1 Add a leaf protocol helper module for secret-bearing identifier metadata classification with the existing marker families.
- [x] 1.2 Update audit, messages, authorization, and session grant validation to use the shared helper while preserving public exports.

## 2. Regression Coverage

- [x] 2.1 Add focused tests that prove audit fixed identifiers and consent-bound grant identifiers reject the same marker families through the shared classifier.
- [x] 2.2 Run focused protocol tests and protocol typecheck.

## 3. Review and Validation

- [x] 3.1 Perform security review for auth/log validation impact and confirm no capture, input, relay routing, installer, startup, service, token, or privilege behavior changed.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Archive the completed OpenSpec change after implementation and verification.
