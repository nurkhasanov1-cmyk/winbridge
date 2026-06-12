## Context

The viewer runtime already updates its local authorization snapshot when it receives a bound `session-control` with action `revoke-permission`. The agent-shell spec also permits a later same-authority `permission-revoked` message as confirmation, while requiring signal sends to remain fail-closed.

## Goals / Non-Goals

**Goals:**

- Add integration coverage for the viewer path where revoke-control is followed by `permission-revoked`.
- Verify the confirmation is emitted as a redacted received runtime event.
- Verify viewer signal sends remain blocked after the confirmation.
- Verify raw private revoke reason text does not appear in local events or logs.

**Non-Goals:**

- No runtime behavior changes.
- No protocol schema changes.
- No audit schema or persistence changes.
- No changes to consent, capture, input, clipboard, file transfer, installer behavior, startup persistence, services, privilege elevation, Windows native APIs, relay behavior, authentication, authorization grants, or token handling.

## Decisions

1. Add a focused integration test using the existing viewer authorization lifecycle server helper.
   - Rationale: the helper can send the exact ordered inbound messages needed to exercise revoke-control followed by confirmation.
   - Alternative considered: change runtime code around `hasBoundViewerRevocationAuthority`. Rejected because the current implementation already permits confirmation for a terminal revoked snapshot.

2. Reuse `expectViewerSignalSendBlocked` after the confirmation.
   - Rationale: this directly proves the confirmation does not restore `screen:view` signal authorization and avoids adding a weaker state-only assertion.
   - Alternative considered: inspect private runtime state. Rejected because integration behavior is the contract.

## Risks / Trade-offs

- [Risk] The new test covers one permission and one authority sequence. -> Mitigation: it targets the security-critical path where revoke-control is followed by confirmation, and the runtime authority checks are shared for permission values.
- [Risk] This adds another agent-shell integration case to an already large file. -> Mitigation: keep the test adjacent to the existing bound revoke-control test and reuse helpers.
