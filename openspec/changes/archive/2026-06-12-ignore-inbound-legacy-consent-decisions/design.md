## Context

The agent shell already binds viewer signal authorization to a modern authorization lifecycle: `session-authorization-decision` addressed to the local viewer establishes host authority, and only a matching active visible `session-authorization-state` can permit viewer-originated `signal` sends. Legacy `host-consent-decision` remains in protocol schemas and relay authority rules, but it is not part of the current viewer authorization state machine.

## Goals / Non-Goals

**Goals:**

- Treat inbound legacy `host-consent-decision` as non-authorizing viewer input.
- Drop it before local `received` events and workflow summary logs so callers do not confuse it with current trusted authorization lifecycle data.
- Keep ignore diagnostics secret-safe.
- Preserve `host-consent-required` request behavior.

**Non-Goals:**

- No new protocol messages or production account identity.
- No native capture, input, clipboard, file-transfer, installer, startup, service, persistence, credential, or privilege-elevation work.
- No support for legacy decisions as a compatibility authorization path.

## Decisions

- Add a dedicated inbound legacy decision filter before event emission.
  - Rationale: `host-consent-decision` is grant-bearing but not authoritative in the current state machine. Filtering before `received` events keeps the local trusted event surface aligned with the authorization model.
  - Alternative considered: allow the received event but ignore it during state updates. Rejected because downstream callers could still misinterpret the local event as trusted consent state.

- Keep modern authorization decisions unchanged.
  - Rationale: current viewer authorization depends on `session-authorization-decision` and matching state/control/revoke messages. This change should not disturb valid current consent flow.

## Risks / Trade-offs

- Legacy compatibility is intentionally fail-closed -> Mitigation: document the non-goal and keep protocol schema validation for legacy messages.
- Over-filtering requests could break host prompt flows -> Mitigation: filter only `host-consent-decision`; do not filter `host-consent-required`.
- Sensitive data leakage in diagnostics -> Mitigation: test with private reason, grant marker, peer id, and raw-token markers and assert ignored events/logs do not expose them.
