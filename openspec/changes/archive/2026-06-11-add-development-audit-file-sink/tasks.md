## 1. OpenSpec

- [x] 1.1 Add proposal, design, audit-log-persistence spec, and tasks.
- [x] 1.2 Validate the OpenSpec change in strict mode.

## 2. Audit File Sink

- [x] 2.1 Add file audit sink that appends JSONL records.
- [x] 2.2 Create parent directories before writing.
- [x] 2.3 Reuse centralized audit validation and redaction.
- [x] 2.4 Add tests for write order, redaction, and write failure.

## 3. Relay Integration and Docs

- [x] 3.1 Add relay audit sink selection via `WINBRIDGE_RELAY_AUDIT_LOG_PATH`.
- [x] 3.2 Add tests for relay file sink selection.
- [x] 3.3 Update README and security/architecture docs.

## 4. Verification

- [x] 4.1 Run typecheck, tests, build, and strict OpenSpec validation.
- [x] 4.2 Archive the completed OpenSpec change.
- [x] 4.3 Commit and push the completed increment.
