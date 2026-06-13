## 1. Validation

- [x] 1.1 Extend shared audit log path validation to reject Unicode bidi and zero-width formatting controls with bounded path-safe errors.
- [x] 1.2 Add shared `FileAuditSink` tests for format-control path rejection and raw path redaction.

## 2. Relay And Agent Coverage

- [x] 2.1 Add relay audit environment tests proving format-control paths fail before file sink startup and do not expose raw path text.
- [x] 2.2 Add agent shell CLI and environment tests proving format-control audit paths fail before runtime start and do not expose raw path text.

## 3. Docs And Specs

- [x] 3.1 Update README, architecture, security model, and main OpenSpec specs to document the new audit path restriction.
- [x] 3.2 Run strict OpenSpec validation for `reject-format-control-audit-paths`.

## 4. Review And Verification

- [x] 4.1 Run focused audit path tests.
- [x] 4.2 Complete security review for logs/config hardening.
- [x] 4.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
