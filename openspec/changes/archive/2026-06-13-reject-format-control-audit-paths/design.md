## Context

Audit log paths are accepted by the shared `FileAuditSink`, relay environment configuration, and agent shell CLI/environment configuration. Current validation rejects blank, untrimmed, oversized, and ASCII-control paths, but permits Unicode format controls such as bidirectional overrides, isolates, marks, word joiner, and zero-width characters.

Those characters can make a path render differently from its actual byte sequence in terminals, review diffs, and operational notes. Because audit logs are used as a development evidence trail, visually deceptive path configuration should fail before any runtime starts or file sink is created.

## Goals / Non-Goals

**Goals:**

- Reject audit log paths containing Unicode bidi or zero-width formatting controls.
- Enforce the rule once in the shared audit path validator used by relay and agent shell configuration.
- Keep validation diagnostics bounded and raw-path-free.
- Update tests, docs, and OpenSpec contracts for relay, agent shell, and shared audit sinks.

**Non-Goals:**

- No Windows native capture, input, service, installer, startup, or privilege-elevation changes.
- No hidden persistence or background audit path discovery.
- No production account authentication or authorization changes.
- No filesystem canonicalization or allowlist policy beyond existing development path validation.

## Decisions

1. Use an explicit code-point denylist for audit paths.
   - Rationale: The codebase already uses explicit denylists for visually confusing metadata. Keeping audit path validation explicit makes behavior understandable and avoids relying on Unicode property support differences.
   - Alternative considered: Normalize or strip format controls. Rejected because silent mutation could write audit records to a path different from the configured value.

2. Keep validation in `packages/audit-log`.
   - Rationale: Relay and agent shell already route file audit path validation through `assertAuditLogPath`, so one shared implementation avoids drift.
   - Alternative considered: Add separate relay/agent checks. Rejected because it duplicates security-sensitive validation and could miss direct `FileAuditSink` construction.

3. Preserve bounded error messages.
   - Rationale: Invalid path diagnostics must not echo raw path values, especially when the rejected value may contain misleading formatting or private local paths.
   - Alternative considered: Report the specific offending code point. Rejected for now because the existing CLI and startup diagnostics are intentionally minimal and path-safe.

## Risks / Trade-offs

- Existing local paths containing zero-width or bidi controls will stop working -> This is intentional fail-closed behavior; use a visible ASCII path instead.
- The denylist is explicit rather than all Unicode `Cf` format characters -> It covers bidi controls, isolates, marks, word joiner, zero-width characters, and `U+FEFF` without rejecting unrelated platform-specific characters by surprise.
- Direct file sink users receive a broader generic error -> Existing callers already get a bounded validation error, and tests assert no raw path disclosure.
