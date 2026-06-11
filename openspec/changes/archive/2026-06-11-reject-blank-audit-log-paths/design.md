## Context

WinBridge currently has local development JSONL audit persistence for the relay and agent shell. The relay selects a file sink when `WINBRIDGE_RELAY_AUDIT_LOG_PATH` is truthy; the agent shell passes `--audit-log` or `WINBRIDGE_AGENT_AUDIT_LOG_PATH` to `FileAuditSink` only when the parsed value is truthy. This leaves blank and whitespace-only values ambiguous: a blank environment variable can silently disable file audit persistence, and a whitespace-only path can create an unintended file name.

The change touches logs and audit configuration only. It does not add native capture, input, unattended access, services, startup persistence, credential collection, or production audit infrastructure.

## Goals / Non-Goals

**Goals:**

- Fail closed when an audit log path is configured as empty or whitespace-only.
- Preserve omitted audit path behavior for local development.
- Keep non-blank paths exact so Windows paths with spaces inside the path remain supported.
- Cover direct file sink construction, relay environment configuration, and agent shell CLI/environment configuration.

**Non-Goals:**

- No production audit storage or account-backed audit service.
- No path canonicalization, allowlist, or directory policy.
- No changes to protocol audit record schemas or redaction rules.
- No changes to consent, authorization, capture, input, installer, startup, or service behavior.

## Decisions

1. Validate at every public configuration boundary.

   `FileAuditSink` will reject blank paths to protect direct package consumers. Relay and agent shell config helpers will reject blank configured values before selecting sinks or starting the runtime. Alternative considered: validate only in CLI/env parsing. That would leave direct construction and future call sites less safe.

2. Treat `undefined` as omitted, but reject `""` and whitespace-only strings.

   Omitted paths keep current development behavior: relay console audit output and agent shell protocol audit-event emission without file persistence. Blank configured values fail fast because they communicate intent to configure persistence without a usable file target. Alternative considered: trim values and use the trimmed path. That can silently change intentional path strings; exact non-blank paths are safer and simpler.

3. Keep errors bounded and secret-safe.

   Error messages name the offending option or environment variable but do not echo the path value. This avoids leaking local path contents into logs while still making misconfiguration clear.

## Risks / Trade-offs

- Existing local scripts that set audit path variables to blank will now fail instead of falling back. This is intended fail-closed behavior and can be fixed by omitting the variable.
- Rejecting whitespace-only paths may reject a technically valid but confusing file name. This is acceptable for audit logs because clarity of persistence target is more important than supporting ambiguous paths.
