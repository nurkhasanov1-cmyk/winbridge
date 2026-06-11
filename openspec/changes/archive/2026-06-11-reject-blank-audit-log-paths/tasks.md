## 1. Audit Path Validation

- [x] 1.1 Add file audit sink tests for empty and whitespace-only paths.
- [x] 1.2 Add relay audit sink tests for omitted, valid, and blank `WINBRIDGE_RELAY_AUDIT_LOG_PATH`.
- [x] 1.3 Add agent shell argument tests for valid, omitted, CLI blank, and environment blank audit paths.
- [x] 1.4 Implement non-blank audit path validation in the shared file sink, relay audit sink config, and agent shell argument parsing.
- [x] 1.5 Update README and security documentation for omitted versus blank audit path behavior.

## 2. Verification

- [x] 2.1 Run focused audit path tests.
- [x] 2.2 Run `npm run check`.
- [x] 2.3 Run `npm test`.
- [x] 2.4 Run `npm run build`.
- [x] 2.5 Run `npm run openspec:validate`.
- [x] 2.6 Run security review for audit/log configuration changes.
- [x] 2.7 Archive the OpenSpec change after implementation and verification are complete.
