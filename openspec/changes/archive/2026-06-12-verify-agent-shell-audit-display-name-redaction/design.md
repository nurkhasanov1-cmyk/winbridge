## Context

Agent-shell workflow audit records are generated locally for host decision, visible activation, revoke, pause, resume, terminate, and expiration simulation. The current implementation writes structured metadata counts and booleans, while raw display names and private reason strings travel in other protocol fields or runtime options.

The existing spec already says persisted workflow audit details must not contain raw display names or raw private reason text. This change makes that invariant directly testable with marker values.

## Goals / Non-Goals

**Goals:**

- Add regression coverage that persists workflow audit records with private host/viewer display names and private lifecycle reasons configured.
- Assert persisted audit records keep useful safe metadata and do not contain those private markers.
- Preserve existing host workflow behavior and protocol semantics.

**Non-Goals:**

- No new remote assistance capability.
- No changes to consent, authorization, relay forwarding, capture, input, clipboard, file transfer, diagnostics, installer, startup, service, or privilege behavior.
- No new audit storage backend or retention design.

## Decisions

1. Add integration coverage at the host workflow persistence layer.
   - Rationale: the risk is end-to-end leakage into persisted audit records, so a runtime integration test provides stronger evidence than a unit-only assertion.
   - Alternative considered: unit-test `sendDevelopmentAuditEvent`, but that helper is internal and unit coverage would not prove the full workflow path.

2. Use unique marker strings for display names, private reasons, pairing codes, and payload terms.
   - Rationale: string absence checks are precise for this log-hygiene invariant and match existing tests for private reason redaction.
   - Alternative considered: only assert exact detail objects. Exact details can miss accidental leakage elsewhere in the persisted record.

## Risks / Trade-offs

- Test may be slightly broader than one workflow path -> Use the existing host workflow lifecycle audit path and keep assertions focused on persisted records.
- Absence checks are only as strong as the markers used -> Use unique markers unlikely to appear in unrelated metadata.

## Migration Plan

This is test/spec hardening only. If it fails, implementation must remove the leak before archive. Rollback is reverting the test/spec change.

## Open Questions

None.
