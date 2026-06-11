## Context

`packages/protocol` already defines an `audit-event` message. The relay forwards protocol envelopes, and the agent shell now simulates explicit host decision, visible active state, and permission revocation. The missing behavior is sending audit-event messages that future clients can observe in development tests.

This change is not production audit persistence. Durable audit records remain owned by audit sinks and future production identity/audit changes.

## Goals / Non-Goals

**Goals:**
- Emit audit-event messages for host authorization approval, denial, visible activation, and permission revocation simulation.
- Use stable action names and accepted/denied outcomes.
- Keep audit-event details secret-safe.
- Cover audit forwarding in integration tests.

**Non-Goals:**
- No new protocol schema.
- No file/database audit persistence.
- No screen capture, input, clipboard, file transfer, diagnostics export, services, startup persistence, or unattended access.
- No raw token, pairing code, credential, or protocol payload logging.

## Decisions

1. Use protocol `audit-event` messages from the host shell.
   - Rationale: the schema already exists and is suitable for development workflow observability.
   - Alternative considered: add direct audit sink dependency to agent-shell. Rejected because this increment is about peer-observable protocol simulation, not local persistence.

2. Emit audit events near the triggering protocol message.
   - Approved decision -> `agent-shell.authorization.approved`.
   - Denied decision -> `agent-shell.authorization.denied`.
   - Active visible state -> `agent-shell.authorization.active`.
   - Permission revoke -> `agent-shell.permission.revoked`.
   - Rationale: event ordering stays easy to verify and follows the simulated host action.

3. Restrict detail fields to safe metadata.
   - Allowed examples: `requestedPermissionCount`, `grantedPermissionCount`, `visibleToHost`, `remainingPermissionCount`, `revokedPermission`, `finalGrantRevoked`.
   - Prohibited: raw token, pairing code, credentials, display names, signal payloads, keystrokes, screenshots, screen contents, and raw reasons.

## Risks / Trade-offs

- Confusion with production audit persistence -> Document that this is development protocol audit simulation only.
- Detail fields accidentally become secret-bearing -> Keep details centrally constructed and tested for common secret strings.
- Extra messages affect test ordering -> Tests wait by message predicates rather than fixed positions.

## Migration Plan

1. Add a helper to send development audit-event messages.
2. Emit events for decision, active state, and revoke paths.
3. Add integration tests for audit-event forwarding and secret-safe details.
4. Update docs and specs.
5. Run check, tests, build, and OpenSpec validation.

Rollback is removing the helper and audit-event sends while preserving existing consent/revoke protocol behavior.

## Open Questions

- Production audit sinks, retention, access controls, and export flows remain future OpenSpec work.
