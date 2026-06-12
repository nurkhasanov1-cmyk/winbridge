## Why

Development audit log paths identify where security-relevant local records are written. Accepting leading or trailing whitespace makes configured paths visually ambiguous and can send audit output to an unintended file.

## What Changes

- Require `FileAuditSink` paths to be non-blank and already trimmed before any record is written.
- Require `WINBRIDGE_RELAY_AUDIT_LOG_PATH`, `WINBRIDGE_AGENT_AUDIT_LOG_PATH`, and agent shell `--audit-log` values to be already trimmed before relay startup or agent runtime start.
- Preserve the existing behavior where omitted audit paths keep console/no-file fallback behavior.
- **BREAKING**: development configurations that intentionally use leading or trailing spaces in audit log file paths will be rejected.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `audit-log-persistence`: configured file audit paths must reject untrimmed values before file sink construction or fallback behavior.
- `agent-shell-consent-workflow`: CLI audit log path validation must reject untrimmed values before runtime start.

## Impact

- Affected code: `packages/audit-log/src/index.ts`, `packages/audit-log/src/index.test.ts`, `apps/relay/src/audit.ts`, `apps/relay/src/audit.test.ts`, `apps/agent-shell/src/args.ts`, and `apps/agent-shell/src/args.test.ts`.
- Affected docs/specs: audit path sections in OpenSpec, README, architecture, and security model docs.
- Safety impact: touches local development audit log configuration and startup validation only. It does not add or change screen capture, remote input, clipboard, file transfer, installer behavior, startup persistence, services, privilege elevation, Windows native APIs, token handling, or production authentication.
