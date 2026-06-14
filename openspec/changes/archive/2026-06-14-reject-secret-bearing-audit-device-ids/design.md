## Context

Audit actor metadata is part of the shared protocol package and can be persisted or emitted by development sinks. The existing audit actor schema already bounds actor ids, allows `deviceId` only for host/viewer actors, and rejects `deviceId` on infrastructure actors. It does not currently apply the shared secret-bearing protocol identifier detector to participant actor `deviceId` values.

## Goals / Non-Goals

**Goals:**

- Reject token-, credential-, cookie-, key-, secret-, and authorization-shaped participant audit actor `deviceId` values before audit records are stored or emitted.
- Keep safe participant device identifiers valid.
- Preserve existing infrastructure actor `deviceId` rejection.
- Keep diagnostics bounded so rejection errors do not echo raw secret-bearing device ids.

**Non-Goals:**

- No changes to relay room routing, join acceptance, pairing, authorization, capture, input, clipboard, file transfer, diagnostics, installer, startup, services, tokens, or privilege behavior.
- No new audit redaction format, persistence backend, or production identity model.
- No broad device identity schema change outside audit actor attribution in this increment.

## Decisions

- Add a refinement to the existing `AuditActorSchema.deviceId` field rather than redacting it after parse.
  Rationale: actor metadata is fixed attribution, not extensible detail. Rejecting unsafe actor fields preserves audit evidence integrity and keeps secret-bearing values out of the record shape entirely.
  Alternative considered: redact participant actor `deviceId` values. That would introduce a new actor-level redaction representation and make actor identity less deterministic without a current caller need.

- Reuse `hasSecretBearingProtocolIdentifierMetadata`.
  Rationale: the helper already covers protocol identifier marker families such as token, credential, cookie, access key, private key, SSH key, authorization header, auth header, and proxy authorization across punctuation separators.
  Alternative considered: create audit-specific device id matching. That would duplicate marker logic and risk drift.

- Keep infrastructure actor rejection as a separate super-refine.
  Rationale: `system` and `relay` actors still must not carry any `deviceId`, even if the value would otherwise be safe.

## Risks / Trade-offs

- [Risk] A caller that previously wrote participant audit records with secret-bearing `deviceId` values will now fail validation. -> Mitigation: this is intentional fail-closed behavior; tests cover safe participant ids and existing infrastructure rejection.
- [Risk] The secret-bearing detector may reject some marker-like but non-secret device ids. -> Mitigation: rejected marker families are inappropriate for audit actor attribution, and callers can use neutral device identifiers.
