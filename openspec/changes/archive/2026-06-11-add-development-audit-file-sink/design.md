## Context

Audit records are already structured and redacted through `packages/protocol`. `packages/audit-log` provides memory and console sinks, and relay writes audit events through a sink abstraction. This change adds a local file sink that keeps the same validation/redaction path.

## Goals / Non-Goals

**Goals:**

- Append one JSON audit record per line.
- Create parent directories automatically.
- Reuse `createAuditRecord` so schema validation and redaction stay centralized.
- Let relay choose file output through an environment variable.
- Add tests for ordered writes, redaction, and write failures.

**Non-Goals:**

- No production immutable audit storage.
- No encryption at rest.
- No log rotation or retention policy.
- No remote upload or telemetry.
- No sensitive payload logging.

## Decisions

1. **Use synchronous append for the development file sink.**
   - Rationale: Existing sink API is synchronous, and surfacing write failure immediately is valuable for audit integrity.
   - Alternative considered: Async queue. That needs flush/close semantics and is better suited to production persistence.

2. **Configure relay through `WINBRIDGE_RELAY_AUDIT_LOG_PATH`.**
   - Rationale: It is simple for local development and CI tests.
   - Alternative considered: CLI argument parsing. The relay currently uses environment configuration.

3. **Do not implement rotation yet.**
   - Rationale: Rotation needs retention and operational policy decisions.
   - Alternative considered: Size-based rotation now. That would add complexity without production requirements.

## Risks / Trade-offs

- **Risk: Local JSONL file grows indefinitely.** -> Mitigation: Document development-only usage and future production retention work.
- **Risk: Write failure can stop relay operations.** -> Mitigation: This is intentional for development audit integrity; production behavior should be designed explicitly.
- **Risk: Sensitive values leak to file.** -> Mitigation: File sink uses the same redaction path and tests assert raw secret absence.

## Migration Plan

1. Add file sink and tests.
2. Add relay env selection.
3. Update docs.
4. Run verification, archive, commit, and push.
