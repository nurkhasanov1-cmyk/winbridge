## 1. Runtime Audit Sink

- [x] 1.1 Add optional audit sink support to agent shell runtime options.
- [x] 1.2 Persist host-generated workflow audit-events through the sink with matching event id, actor, session id, action, outcome, and secret-safe detail metadata.
- [x] 1.3 Surface audit sink write failures instead of silently dropping records.

## 2. CLI Configuration

- [x] 2.1 Add `--audit-log` CLI flag and `WINBRIDGE_AGENT_AUDIT_LOG_PATH` environment support.
- [x] 2.2 Move `@winbridge/audit-log` to agent-shell runtime dependencies.

## 3. Tests and Documentation

- [x] 3.1 Add integration tests for persisted approval/activation records, denial redaction, lifecycle records, sink failure, and ignoring arbitrary received payloads.
- [x] 3.2 Add CLI/env audit path tests or coverage through runtime construction helpers.
- [x] 3.3 Document agent-shell audit file configuration and safety boundaries in README and security/architecture docs.

## 4. Review and Verification

- [x] 4.1 Run security review for audit/log and consent workflow changes.
- [x] 4.2 Run `npm run check`.
- [x] 4.3 Run `npm test`.
- [x] 4.4 Run `npm run build`.
- [x] 4.5 Run `npm run openspec:validate`.
- [x] 4.6 Archive the completed OpenSpec change and rerun validation.
