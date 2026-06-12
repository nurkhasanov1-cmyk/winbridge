## 1. Audit Reason Redaction

- [x] 1.1 Extend top-level audit reason detection to redact access-key and SSH-key markers.
- [x] 1.2 Add audit tests proving access-key and SSH-key reason values are redacted.
- [x] 1.3 Verify existing bounded safe reason codes remain preserved.

## 2. Specs and Verification

- [x] 2.1 Sync main `audit-log-persistence` spec with access-key and SSH-key audit reason redaction requirements.
- [x] 2.2 Run focused audit tests.
- [x] 2.3 Run strict OpenSpec validation for `redact-key-material-audit-reasons`.
- [x] 2.4 Run `npm run verify`.
- [x] 2.5 Perform a security review of auth/logging impact and confirm no new remote-assistance capability is introduced.
