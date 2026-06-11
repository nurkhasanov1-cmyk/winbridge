## Context

WinBridge currently validates protocol envelope shapes, permission scopes, reasons, signal payloads, and relay message size. Identifier fields such as `sessionId`, `peerId`, `messageId`, `authorizationId`, `pairingId`, and `auditId` are used across protocol parsing, relay room registration, authorization records, pairing records, and audit-related messages. Several of these fields only require minimum length, so an oversized or whitespace/control-character identifier can pass far enough to allocate state or appear in metadata.

## Goals / Non-Goals

**Goals:**
- Define one shared machine-readable identifier profile for protocol-facing IDs.
- Apply that profile consistently across protocol envelopes, authorization records, session grants, pairing tickets, paired devices, and local device identity IDs.
- Preserve all existing generated and documented development IDs.
- Keep relay errors and audit reasons secret-safe when ID validation fails.

**Non-Goals:**
- No account identity provider, MFA, native Windows identity, or production authorization model.
- No changes to pairing code format.
- No screen capture, remote input, clipboard, file transfer, installer, startup, service, or privilege behavior.
- No user-visible display name normalization beyond existing bounds.

## Decisions

1. Centralize identifier schemas in `packages/protocol/src/session.ts`.

   Rationale: `session.ts` is already imported by protocol messages, authorization, and identity modules. Defining exported schemas there avoids duplicate regex/bounds and keeps relay/agent behavior consistent.

   Alternative considered: define per-module ID schemas. That would reduce imports but risks drift as new message types are added.

2. Use a bounded printable machine-ID profile instead of UUID-only IDs.

   The profile should allow current values such as `session-demo`, `host-1`, `viewer-1`, generated UUIDs, and prefixed generated IDs such as `authz_<uuid>`, `audit_<uuid>`, and `pair_<uuid>`. It should reject whitespace, control characters, path-like separators, raw JSON snippets, and very large strings.

   Alternative considered: UUID-only identifiers. That would be cleaner for production but would break current development examples and CLI ergonomics before a production identity layer exists.

3. Keep malformed identifier details out of relay rejection reasons.

   Protocol schema errors should continue to map to the generic `Invalid relay message` reason at the relay boundary unless the error is an existing allow-listed policy reason. This prevents oversized or secret-like ID values from being reflected to peers or stored as invalid-message audit reasons.

   Alternative considered: expose exact identifier validation messages to peers. That would aid debugging but increases reflection/logging risk on the network edge.

## Risks / Trade-offs

- Existing local scripts that use spaces or path separators in IDs will be rejected. Mitigation: documented examples already use machine-readable IDs; the CLI remains development-only and can display parser failures locally.
- Some schemas become stricter at once. Mitigation: add focused protocol, authorization, identity, and relay integration tests before changing behavior.
- A single shared schema may be too strict for a future production account identifier. Mitigation: keep this profile scoped to protocol-facing machine IDs; production account identity can get a separate OpenSpec change.

## Migration Plan

- Add shared schemas and update protocol/authorization/identity schemas.
- Add tests for accepted existing examples and rejected oversized/unsafe IDs.
- Verify relay join rejection remains generic and secret-safe.
- Rollback is a normal revert of the schema/test change; no persisted data migration is required in the current development-only state.

## Open Questions

- None for this development hardening slice.
