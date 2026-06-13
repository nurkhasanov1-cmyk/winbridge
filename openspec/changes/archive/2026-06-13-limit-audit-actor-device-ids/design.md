## Context

The shared audit schema accepts actor metadata for infrastructure actors (`system`, `relay`) and participant actors (`host`, `viewer`). `deviceId` is currently optional on every actor type, even though only host and viewer actors represent device-bound participants.

This change touches audit logs only. It does not alter relay routing, tokens, session authorization, capture, input, installer, startup, service, or privilege behavior.

## Goals / Non-Goals

**Goals:**

- Make audit actor attribution less ambiguous by allowing `deviceId` only on host and viewer actors.
- Keep current relay audit actor ids and agent-shell participant audit records valid.
- Fail closed during shared audit record validation before records reach sinks, protocol encoding, or persistence.

**Non-Goals:**

- Do not require host/viewer actors to include `deviceId`; some existing development tests and callers use participant actor ids without a device id.
- Do not constrain generic peer ids to `host-*` or `viewer-*` prefixes because the current protocol identifier contract does not require role-prefixed peer ids.
- Do not add native Windows capture, input, service, installer, startup, or persistence behavior.

## Decisions

- Enforce the rule in `AuditActorSchema` with a cross-field refinement.
  - Rationale: all audit record creation and sinks already parse through this schema, so the rule applies consistently before records are emitted or persisted.
  - Alternative considered: add checks in relay and agent-shell call sites. That would leave direct users of the shared audit package able to create ambiguous records.

- Reject only `system` and `relay` actors carrying `deviceId`.
  - Rationale: it removes the ambiguous infrastructure/device combination without creating a breaking requirement for all participant records to include device identity.
  - Alternative considered: require `deviceId` on every host/viewer actor. Existing development file-sink tests and possible external callers create participant audit records without device ids, so that would be a larger migration.

## Risks / Trade-offs

- Existing callers that attached `deviceId` to relay/system audit records will fail validation. -> This is intentional because that metadata is misleading; callers should move non-secret infrastructure metadata into `detail`.
- The schema still cannot prove that a host/viewer `deviceId` belongs to the actor id. -> Future identity-bound audit changes can add pairing/session checks once production identity persistence is introduced.
