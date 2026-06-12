## Why

Top-level audit reasons can be produced on failure paths before structured details are available. Existing reason redaction catches tokens, API keys, authorization headers, cookies, private keys, and remote content markers; access-key and SSH-key aliases should receive the same treatment to reduce audit-log leakage risk.

## What Changes

- Redact top-level audit `reason` values that contain access-key or SSH-key material.
- Add focused audit tests proving raw access-key and SSH-key reason strings are replaced with `[REDACTED]`.
- Preserve existing bounded safe reason strings.
- Non-goals: no new capture, input, clipboard, file-transfer, diagnostics, startup, service, persistence, privilege-elevation, evasion, bypass, or hidden-session behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `audit-log-persistence`: expand audit reason redaction to cover access-key and SSH-key material.

## Impact

- Affected code: `packages/protocol/src/audit.ts`.
- Affected tests: `packages/protocol/src/audit.test.ts`.
- Affected specs: `openspec/specs/audit-log-persistence/spec.md`.
- Dependencies: none.
- Security review: required because this touches auth/secret handling and audit logging behavior.
