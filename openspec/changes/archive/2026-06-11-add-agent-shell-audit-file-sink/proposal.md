## Why

The agent shell currently emits development `audit-event` protocol messages for consent workflow transitions, but those events are not durably recorded by the host process. A local JSONL audit sink gives developers and future Windows adapters a tested persistence path for consent, visibility, revoke, pause, terminate, and expiration events without adding remote capabilities.

## What Changes

- Add optional agent-shell development audit sink support using the existing `@winbridge/audit-log` package.
- Persist host workflow audit events to a local JSONL file when configured by CLI flag or environment variable.
- Reuse the same event id, actor, session id, action, outcome, and secret-safe details as the protocol `audit-event`.
- Surface audit sink write failures to the runtime caller instead of silently dropping records.
- Document that agent-shell audit files are local development artifacts and must not contain raw secrets.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: Host workflow audit-event simulation can also persist secret-safe audit records locally.
- `audit-log-persistence`: Agent shell can configure and use the development JSONL file audit sink.

## Impact

- Affected code: `apps/agent-shell`, `apps/agent-shell` tests, package dependency metadata, README/docs, OpenSpec specs.
- API impact: `createAgentShellRuntime` gains an optional audit sink; CLI gains `--audit-log` and `WINBRIDGE_AGENT_AUDIT_LOG_PATH`.
- Safety impact: strengthens auditability of consent workflow simulation and does not authorize any remote action.
- Touches logs/audit and authorization workflow events; requires security review.
- Non-goals: production audit storage, encryption, account authentication, screen capture, input injection, clipboard sync, file transfer, installer behavior, startup behavior, service registration, privilege elevation, hidden access, or Windows security prompt bypass.
