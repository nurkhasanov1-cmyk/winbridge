## Context

The authorization helper creates a pending authorization with `requestedPermissions` stored in the `permissions` field. Approval then replaces that list with `grantedPermissions`.

Remote action checks still require active visible state, but the grant creation step should never expand scope beyond what the viewer requested. Future native UI and adapters will rely on this shared helper as a guardrail.

## Goals / Non-Goals

**Goals:**

- Validate that pending requests contain at least one permission.
- Allow host approval to grant all or a subset of requested permissions.
- Reject approvals that include unrequested permissions.
- Reject empty and duplicate approval grants.

**Non-Goals:**

- Change protocol message wire schema, relay behavior, agent-shell CLI behavior, native Windows UI, capture/input, clipboard/file transfer, installer/service behavior, startup persistence, credential access, privilege elevation, hidden sessions, or security prompt bypass.

## Decisions

1. Enforce subset checks in `approveSessionAuthorization`.
   - Rationale: approval is the state-machine transition where grant scope is created. Centralizing here protects future callers.
   - Alternative considered: rely on UI or caller logic. Rejected because duplicated caller checks are easy to miss.

2. Keep host ability to narrow requested permissions.
   - Rationale: a host may approve screen viewing but deny input from a broader viewer request. Narrowing is consent-preserving.
   - Alternative considered: require exact equality. Rejected because it would force all-or-nothing approvals.

3. Reject empty approval grants.
   - Rationale: an approval with no permissions is semantically a denial and can confuse lifecycle/audit semantics.
   - Alternative considered: allow active sessions with no permissions. Rejected because it creates meaningless approved state.

## Risks / Trade-offs

- [Risk] Future flows might want "approve connection but no actions yet." -> Mitigation: model that as pending/denied or a separate future capability, not as an active grant.
- [Risk] Existing dev tests might rely on empty grants. -> Mitigation: current protocol request flows use explicit non-empty permissions; tests are updated to make the contract clear.
