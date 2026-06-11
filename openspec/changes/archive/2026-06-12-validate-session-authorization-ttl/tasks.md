## 1. Authorization TTL Validation

- [x] 1.1 Add protocol authorization tests for default TTL behavior and valid explicit TTL values.
- [x] 1.2 Add protocol authorization tests for fractional, negative, zero, non-finite, and timer-unsafe TTL values.
- [x] 1.3 Implement bounded positive integer TTL validation in pending session authorization creation.
- [x] 1.4 Update security documentation to describe bounded authorization TTL inputs.

## 2. Verification

- [x] 2.1 Run focused protocol authorization tests.
- [x] 2.2 Run `npm run check`.
- [x] 2.3 Run `npm test`.
- [x] 2.4 Run `npm run build`.
- [x] 2.5 Run `npm run openspec:validate`.
- [x] 2.6 Run security review for authorization TTL changes.
- [x] 2.7 Archive the OpenSpec change after implementation and verification are complete.
