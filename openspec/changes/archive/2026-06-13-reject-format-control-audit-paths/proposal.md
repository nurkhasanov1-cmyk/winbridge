## Why

Audit log paths are local development configuration, but they are part of the security evidence trail. Unicode bidirectional and zero-width formatting controls can make two path strings render deceptively or hide path segments in terminals, docs, and review tools, so audit path validation should fail closed before any file audit sink is created.

## What Changes

- Reject audit log path values that contain Unicode bidirectional or zero-width formatting controls.
- Apply the rule to shared `FileAuditSink` construction, relay `WINBRIDGE_RELAY_AUDIT_LOG_PATH`, agent `WINBRIDGE_AGENT_AUDIT_LOG_PATH`, and agent `--audit-log`.
- Keep error messages bounded and path-safe; rejected diagnostics must not echo raw path text.
- Document the additional audit path restriction.
- Non-goals: no native Windows capture/input, no installer, no service/startup behavior, no persistence beyond the existing explicit audit file path, and no production identity or authorization model change.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `audit-log-persistence`: Audit log path validation rejects Unicode bidi and zero-width formatting controls before creating file audit sinks.
- `agent-shell-consent-workflow`: Agent CLI audit path validation rejects Unicode bidi and zero-width formatting controls before runtime start.
- `relay-runtime`: Relay audit path environment validation rejects Unicode bidi and zero-width formatting controls before runtime startup.

## Impact

- Affected code: `packages/audit-log`, `apps/relay`, `apps/agent-shell`.
- Affected docs/specs: README, architecture/security model docs, OpenSpec audit-log, relay runtime, and agent shell specs.
- Security scope: logs and local development configuration only.
- Safety impact: strengthens audit trail integrity by preventing visually deceptive configured audit paths; does not add remote access capability.
