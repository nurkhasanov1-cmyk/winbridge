## Context

The development relay validates registered peer messages, chooses the remaining room peer, forwards the validated envelope, and emits `relay.message.forwarded` audit metadata. The audit record currently follows recipient delivery. That ordering is observable only on audit sink failure, but it is a security-relevant gap because accepted relay forwarding is part of the consent and authorization evidence chain for later remote-assistance capabilities.

This change keeps the relay in the development bootstrap scope. It strengthens ordering around existing accepted forwarding without adding new protocol messages, permissions, capture, input, clipboard, file-transfer, diagnostics, native Windows APIs, installer behavior, startup behavior, services, tokens, or privilege behavior.

## Goals / Non-Goals

**Goals:**

- Commit accepted `relay.message.forwarded` audit records before sending a registered peer message to the recipient.
- Fail closed if accepted-forward audit writing fails before recipient delivery.
- Keep rejection diagnostics and rejection audit metadata bounded and secret-safe.
- Add integration coverage for the audit-failure path.

**Non-Goals:**

- Do not change successful relay message shapes, routing decisions, pairing, token validation, heartbeat, rate-limit configuration, room membership, or authorization semantics.
- Do not add screen capture, input, clipboard, file-transfer, diagnostics, production identity, production relay, installer, startup, service, privilege, native Windows, hidden-session, credential, keylogging, evasion, or prompt-bypass behavior.
- Do not make the development relay a production durable audit system.

## Decisions

1. Write the accepted-forward audit record before recipient sends.

   Rationale: audit must not trail an accepted forwarding side effect. The relay already computes recipient and safe audit metadata before sending, so it can write the audit record first without changing successful message delivery semantics.

   Alternative considered: leave ordering as-is and rely on audit sink reliability. That preserves current happy-path behavior but allows an accepted message delivery without accepted-forward evidence if the sink fails.

2. Treat accepted-forward audit failure as a rejected relay message for the sender.

   Rationale: the sender should receive the existing bounded `relay-error` path when possible, and the original recipient should not receive the unaudited message. A test sink can fail only the accepted-forward audit action while still accepting the rejection audit, proving the fail-closed path without requiring production persistence.

   Alternative considered: close the relay connection immediately on audit failure. This is stricter, but it would change more peer-visible behavior than needed for this scoped ordering fix.

3. Keep accepted-forward audit detail unchanged.

   Rationale: the risk is ordering, not metadata shape. Existing accepted-forward audit detail already omits raw protocol payloads, display names, private reasons, grant scopes, and remote-content markers.

## Risks / Trade-offs

- **Risk: Audit write is now on the forwarding critical path.** -> Mitigation: this is intentional for accepted forwarding; auditability is a required safety invariant for sensitive relay side effects.
- **Risk: A failing audit sink can block forwarding.** -> Mitigation: fail-closed behavior is safer than unaudited delivery, and the scope is the development relay.
- **Risk: Rejection path could leak the private payload that failed to forward.** -> Mitigation: use existing bounded relay-error and rejection audit paths, and add a test with private markers in the rejected protocol message.
- **Risk: Implementation could alter successful forwarding behavior.** -> Mitigation: preserve existing successful forwarding tests and add only the audit-failure path.

## Migration Plan

1. Reorder registered-message forwarding so accepted audit writes before recipient delivery.
2. Add a relay integration test that injects an audit sink failing on `relay.message.forwarded`, sends a private-marker protocol message, asserts the recipient does not receive it, and asserts diagnostics/audit remain bounded.
3. Update security documentation if needed to state accepted forward audit precedes recipient delivery.
4. Run focused relay tests, full verification, security review, strict OpenSpec validation, then archive the change.
