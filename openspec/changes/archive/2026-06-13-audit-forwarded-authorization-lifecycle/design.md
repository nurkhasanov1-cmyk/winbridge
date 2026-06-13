## Context

Relay accepted-forward audit records are intentionally metadata-only. They currently include `messageType`, `messageId`, `recipientPeerId`, `recipientRole`, and a signal `authorizationId` when forwarding `signal` messages. Authorization lifecycle and control messages also carry a non-secret `authorizationId`, but relay audit records do not persist that correlation key.

This change only affects accepted relay audit metadata. It does not alter protocol validation, forwarding authority, recipient targeting, permission grants, host visibility, capture, input, relay token handling, installer behavior, services, or privilege boundaries.

## Goals / Non-Goals

**Goals:**

- Add `authorizationId` to accepted forward audit detail for authorization lifecycle messages that carry one.
- Keep audit records secret-safe by preserving an explicit metadata whitelist.
- Cover authorization request, decision, state, permission revocation, and session control forwarding.

**Non-Goals:**

- No forwarding policy changes.
- No raw payload, reason, permission, display name, token, pairing code, signal payload, or audit-event detail persistence.
- No production audit storage change beyond the existing relay audit sink data shape.

## Decisions

1. Extend `acceptedForwardAuditDetail`.
   - Rationale: all accepted forwarding audit detail already flows through this function, so a single whitelist preserves a tight boundary.
   - Alternative considered: add metadata at each send site. Rejected because it would duplicate audit-shaping logic and increase omission risk.

2. Only copy `authorizationId` from message types where it is already a top-level validated identifier.
   - Rationale: `session-authorization-decision`, `session-authorization-state`, `permission-revoked`, `session-control`, and `signal.payload.authorizationId` are protocol identifiers and are needed for lifecycle correlation.
   - Alternative considered: include permission lists or reasons. Rejected because reasons and grant scopes are more sensitive and unnecessary for relay correlation.

3. Keep `session-authorization-request` without `authorizationId`.
   - Rationale: requests do not carry an authorization id yet; correlation starts when a host decision creates one.

## Risks / Trade-offs

- Extra audit metadata slightly increases record size. Mitigation: one bounded protocol identifier is added only for relevant forwarded messages.
- More lifecycle correlation metadata is available in relay audit stores. Mitigation: the identifier is non-secret and already sent over the protocol; no raw reasons, permissions, payloads, tokens, or pairing codes are persisted.
