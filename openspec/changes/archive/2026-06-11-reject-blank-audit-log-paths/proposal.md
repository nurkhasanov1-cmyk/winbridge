## Why

Blank or whitespace-only audit log path configuration is ambiguous and can make operators believe persistent audit logging is enabled when the development relay or agent shell will not write the intended JSONL file. Audit persistence is part of the consent-first safety story, so configured-but-blank paths should fail closed instead of silently falling back or writing to an unintended location.

## What Changes

- Reject blank or whitespace-only file audit sink paths before writing audit records.
- Reject blank `WINBRIDGE_RELAY_AUDIT_LOG_PATH` values instead of falling back to console audit output.
- Reject blank agent shell audit paths from `--audit-log` or `WINBRIDGE_AGENT_AUDIT_LOG_PATH` before starting the runtime.
- Preserve omitted audit path behavior: relay continues console audit output, and agent shell continues protocol audit-event emission without local file persistence.
- Non-goals: no production audit backend, no native Windows capture/input, no service installation, no startup persistence, no credential collection, and no changes to consent or authorization semantics.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `audit-log-persistence`: configured audit log paths must be non-blank and fail before audit fallback or runtime start when blank.
- `agent-shell-consent-workflow`: CLI audit path validation rejects blank audit-log inputs before connecting to the relay.

## Impact

- Affected code: `packages/audit-log`, `apps/relay`, `apps/agent-shell`, README/security docs, and focused tests.
- Affected systems: local development audit JSONL persistence and CLI/env configuration handling.
- Safety impact: strengthens audit availability expectations by failing closed for ambiguous configured audit persistence.
- Security review: required because this touches logs and audit configuration.
