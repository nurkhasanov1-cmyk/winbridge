## Context

The agent shell emits host-generated workflow messages for authorization decisions, visible active state, revocation, pause, resume, termination, expiration, and matching development `audit-event` protocol messages. It can also persist those curated audit events through an injected local audit sink.

Today the audit write is coupled to sending the protocol `audit-event`, but several associated workflow messages are already sent before that write is attempted. If the audit sink fails, the runtime reports an error but the viewer may have already observed an unaudited decision or lifecycle transition.

## Goals / Non-Goals

**Goals:**

- Make configured local audit persistence a precondition for emitting the associated host workflow messages.
- Keep audit details secret-safe and reuse the same event id for persisted records and protocol `audit-event` messages.
- Preserve message ordering for successful workflows: associated workflow message first, then the matching protocol `audit-event`.
- Surface audit sink failures through existing sanitized runtime error handling.

**Non-Goals:**

- No production audit backend, tamper evidence, encryption, retention policy, or account-bound audit trail.
- No persistence of raw protocol payloads, raw relay tokens, raw pairing codes, display names, private reasons, screenshots, keystrokes, screen contents, input contents, or local file paths.
- No native Windows capture, input, clipboard, file transfer, installer, service, startup, privilege, hidden access, evasion, credential access, or prompt bypass behavior.

## Decisions

1. **Split audit preparation from protocol emission.**
   - Rationale: A helper can create the audit event id, write the local audit record, and return the protocol `audit-event` envelope. Callers can then send associated workflow messages and the matching audit-event in the desired order.
   - Alternative considered: Send the audit-event before the workflow message. That avoids unaudited sends but changes observable ordering more than needed.

2. **Prepare audit before mutating externally meaningful authorization state.**
   - Rationale: If an audit sink fails, the host should not locally mark a grant active, revoked, paused, resumed, terminated, or expired before reporting the sanitized runtime error.
   - Alternative considered: Mutate local state first and skip network sends on audit failure. That leaves internal state inconsistent with the external workflow.

3. **Keep no-sink development mode non-blocking.**
   - Rationale: Omitting an audit sink means there is no local persistence contract to satisfy. Protocol audit-event simulation remains useful for development and tests.

## Risks / Trade-offs

- **Risk: A configured audit path failure blocks consent workflow progress.** Mitigation: fail-closed behavior is intentional for configured audit persistence; users can omit the sink when they only want protocol simulation.
- **Risk: Refactoring audit emission changes event ids or details.** Mitigation: existing tests continue to compare persisted records with protocol audit-events, and new tests cover failure ordering.
- **Risk: Partial sends still occur if network writes fail after audit persistence.** Mitigation: this change only addresses local audit write failures; network delivery reliability is handled separately by relay/runtime behavior.
