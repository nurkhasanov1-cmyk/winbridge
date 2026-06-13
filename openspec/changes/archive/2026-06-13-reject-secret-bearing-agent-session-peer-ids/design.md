## Context

Agent-shell currently validates session ids and peer ids for protocol syntax in both CLI parsing and direct managed runtime creation. Device ids already reject secret-bearing protocol identifier metadata at the agent-shell boundary, but session and peer identifiers can still contain token-, credential-, cookie-, key-, or authorization-looking marker text if they satisfy the identifier schema.

Session and peer ids are protocol routing metadata, not secret stores or account authentication. They are sent in join/session messages before any remote assistance workflow can complete, so agent-shell should fail closed before relay startup when those identifiers look like they contain secret metadata.

## Goals / Non-Goals

**Goals:**

- Reject secret-bearing CLI `--session` and `--peer` values through bounded usage handling.
- Reject secret-bearing direct runtime `sessionId` and `peerId` values before relay startup.
- Keep generated defaults and safe custom identifiers valid.
- Keep errors/logs/events from exposing raw rejected identifiers.
- Preserve existing relay/protocol audit redaction behavior.

**Non-Goals:**

- Change shared `SessionIdSchema`, `PeerIdSchema`, or all protocol users.
- Change relay routing, pairing, signaling, or audit persistence semantics.
- Add production identity, account auth, device trust, or reconnect semantics.
- Add or change capture, input, clipboard, diagnostics, file transfer, installer, startup, services, privileges, or Windows-native behavior.
- Store, parse, recover, or transform credential material.

## Decisions

- Reuse `hasSecretBearingProtocolIdentifierMetadata` from `@winbridge/protocol`.
  - Rationale: this keeps session, peer, and device identifier hygiene aligned with the same marker families used by existing audit-sensitive protocol identifier handling.
  - Alternative considered: introduce a separate session/peer marker list. That would create drift and duplicate maintenance.

- Add a local helper in agent-shell for secret-bearing protocol identifier rejection.
  - Rationale: CLI parsing and runtime validation need the same check for session, peer, and device ids, and the error paths must remain static and bounded.
  - Alternative considered: inline checks in each parser/assertion. That works but increases inconsistency risk as more identifiers are covered.

- Enforce at both entry points: CLI argument parsing and direct managed runtime creation.
  - Rationale: library callers can bypass CLI parsing by constructing runtime options directly, so runtime validation must remain authoritative before relay startup.
  - Alternative considered: CLI-only validation. That leaves direct runtime callers able to send secret-bearing session or peer ids.

- Do not change shared protocol schemas in this increment.
  - Rationale: shared schemas are broader protocol contracts and downstream relay/audit behavior still needs to validate/redact inbound metadata from non-agent-shell sources. This is an earlier boundary for the non-native agent shell.
  - Alternative considered: reject secret marker metadata globally in all protocol identifier schemas. That is broader and could break existing relay/audit redaction scenarios outside this requirement.

## Risks / Trade-offs

- Existing development scripts using session or peer ids that include words like `token`, `secret`, `cookie`, `authorization`, or key marker families will fail closed. Mitigation: generated defaults remain valid and docs will clarify that identifiers are non-secret metadata.
- Protocol users outside agent-shell can still produce secret-bearing identifiers. Mitigation: this is intentional scope control; relay/protocol validation and audit redaction remain downstream safeguards.
- Marker matching can reject benign ids that contain sensitive marker substrings. Mitigation: fail-closed behavior is appropriate for routing metadata that does not need secret-looking vocabulary.

## Migration Plan

- Implement the CLI/runtime validation and focused tests in one release.
- Existing safe custom ids need no migration.
- Users with rejected custom ids should choose non-secret routing metadata such as `session-demo-01`, `viewer-01`, or use generated defaults.
- Rollback is the previous validation behavior; no data migration is required.

## Open Questions

- None for this increment.
