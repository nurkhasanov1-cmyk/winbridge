## Why

The project has structured audit records and development console/memory sinks, but relay audit events are not persisted across process lifetime. A local JSONL file sink improves development diagnostics and future audit persistence design without adding remote-control capabilities.

## What Changes

- Add a file-backed audit sink that appends one redacted JSON audit record per line.
- Ensure parent directories are created before writing.
- Surface write failures instead of silently dropping audit records.
- Add relay support for `WINBRIDGE_RELAY_AUDIT_LOG_PATH` to select file audit output in development.
- Add tests proving file output order, redaction, and error behavior.

Safety impact:

- This change touches audit/logging behavior.
- It does not add screen capture, input, clipboard, file transfer, installer, services, startup, privilege escalation, or unattended access.
- Audit details remain secret-safe and must not persist raw credentials, tokens, pairing codes, keystrokes, screenshots, or screen contents.

## Capabilities

### New Capabilities
- `audit-log-persistence`: Development JSONL audit file sink and relay configuration for local persistent audit records.

### Modified Capabilities

None.

## Impact

- Updates `packages/audit-log`.
- Updates relay audit sink factory.
- Updates docs and README with development audit path usage.
- Adds archived OpenSpec change artifacts and active `audit-log-persistence` spec after archive.
