## 1. OpenSpec Preparation

- [x] 1.1 Validate the proposed OpenSpec change artifacts with strict validation before implementation.

## 2. Audit Redaction

- [x] 2.1 Add shared audit tests for passphrase detail redaction, passphrase reason redaction, passphrase action rejection, and passphrase-bearing authorization id redaction.
- [x] 2.2 Add protocol audit-event parse/encode tests for passphrase detail redaction.
- [x] 2.3 Add passphrase to the shared audit sensitive-key, reason, and protocol-identifier marker detection.

## 3. Verification

- [x] 3.1 Run the focused shared audit and protocol message test files.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Perform a log-safety review confirming the change only tightens audit redaction/rejection and adds no capture, input, auth, relay routing, installer, startup, service, token storage, new logging sink, or privilege behavior.
