## 1. Audit Path Validation

- [x] 1.1 Reject untrimmed shared `FileAuditSink` paths before write setup.
- [x] 1.2 Reject untrimmed relay `WINBRIDGE_RELAY_AUDIT_LOG_PATH` values before selecting an audit sink.
- [x] 1.3 Reject untrimmed agent shell `--audit-log` and `WINBRIDGE_AGENT_AUDIT_LOG_PATH` values before runtime start.

## 2. Tests

- [x] 2.1 Add shared audit-log tests for untrimmed `FileAuditSink` path rejection.
- [x] 2.2 Add relay audit configuration tests for untrimmed environment path rejection.
- [x] 2.3 Add agent-shell argument tests for untrimmed CLI and environment audit path rejection.
- [x] 2.4 Stabilize or update focused tests only if required by the validation changes.

## 3. Specs, Docs, Verification, and Review

- [x] 3.1 Sync main OpenSpec specs and docs with canonical audit path requirements.
- [x] 3.2 Run focused audit path tests.
- [x] 3.3 Run `npm run verify`.
- [x] 3.4 Perform a security review of audit path validation, diagnostics, startup behavior, fallback behavior, logging, and OpenSpec impact.
