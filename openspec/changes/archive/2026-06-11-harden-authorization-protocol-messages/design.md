## Context

The protocol package is the shared wire contract for host, viewer, relay, and future native adapters. Runtime authorization helpers already validate permission-scope safety, but malformed protocol messages should be rejected before relay forwarding or peer-side state processing.

## Goals / Non-Goals

**Goals:**

- Add permission-list uniqueness checks to authorization request, decision, and state update message schemas.
- Require approved decisions and approved/active/paused state updates to carry a non-empty grant scope.
- Require fail-closed authorization state updates to carry no grant scope.
- Keep existing development shell messages valid under the hardened schema.

**Non-Goals:**

- No new sensitive remote action capability.
- No changes to capture, input, clipboard, file transfer, installer, service, startup, privilege, or native Windows behavior.
- No production account identity or transport security changes.

## Decisions

- Use schema-level `superRefine` checks in `packages/protocol/src/messages.ts`. This keeps inbound parse and outbound encode behavior consistent because all callers already go through `parseProtocolEnvelope` or `encodeProtocolEnvelope`.
- Treat `approved`, `active`, and `paused` state updates as grant-bearing. These states need a unique non-empty permission list because they represent a current approved scope.
- Treat `pending`, `denied`, `revoked`, `terminated`, and `expired` state updates as fail-closed. They must not carry permissions in the state update because peers must not confuse terminal or pre-approval state with a usable grant.
- Keep request and decision subset matching out of message schema scope. The protocol schema can validate shape and local invariants; matching a decision to a specific prior request remains state-machine responsibility.

## Risks / Trade-offs

- Some permissive development fixtures may fail after schema hardening. Mitigation: update protocol and agent-shell tests to use valid fail-closed state payloads.
- Rejecting terminal state permissions is stricter than the generic state field type. Mitigation: current runtime sends empty terminal scopes, and stricter wire behavior aligns with deny-by-default semantics.
- Message schemas still cannot prove that a grant is a subset of a previous request. Mitigation: state-machine helpers continue enforcing cross-message/request invariants.
