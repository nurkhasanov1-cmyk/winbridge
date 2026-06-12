# Tasks

## 1. Protocol Audit Redaction

- [x] 1.1 Add shared audit reason redaction in `packages/protocol/src/audit.ts`.
- [x] 1.2 Preserve safe bounded audit reasons.
- [x] 1.3 Add protocol tests for sensitive and safe top-level audit reasons.

## 2. Audit Sink Coverage and Documentation

- [x] 2.1 Add memory, console, or file sink tests proving emitted/persisted reasons are redacted.
- [x] 2.2 Update `audit-log-persistence` spec and security docs for top-level reason redaction.

## 3. Verification and Review

- [x] 3.1 Run focused protocol and audit-log tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Complete security review for audit reason redaction.
- [x] 3.4 Archive the completed OpenSpec change.
