## 1. Protocol Secret-Key Handling

- [x] 1.1 Add access-key and SSH-key indicators to shared signal payload rejection.
- [x] 1.2 Add access-key and SSH-key indicators to shared audit detail redaction.
- [x] 1.3 Add protocol tests proving signal parse and encode reject access-key and SSH-key payload fields.
- [x] 1.4 Add audit tests proving audit records and protocol `audit-event` parse/encode redact access-key and SSH-key detail fields while preserving `authorizationId`.

## 2. Specs and Verification

- [x] 2.1 Sync main `audit-foundation` and `session-broker` specs with the new defensive requirements.
- [x] 2.2 Run focused protocol tests for message and audit secret-key handling.
- [x] 2.3 Run strict OpenSpec validation for `expand-secret-key-safety`.
- [x] 2.4 Run `npm run verify`.
- [x] 2.5 Perform a security review of auth/logging/signal impact and confirm no new remote-assistance capability is introduced.
