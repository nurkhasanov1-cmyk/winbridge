## Context

WinBridge depends on shared authorization helpers to keep future native adapters deny-by-default. `assertSessionActionAuthorized` already denies anything not active, visible, unexpired, and scoped to the requested permission.

`revokeSessionPermission` currently parses any authorization and removes the named permission regardless of lifecycle status. This is too broad for a host session-control operation. Permission revocation should only apply to a live host-visible authorization that has grants to revoke.

## Goals / Non-Goals

**Goals:**

- Allow permission revocation from `active` and `paused` authorizations only.
- Require host-visible and unexpired authorization state before revocation.
- Reject missing-permission revocation rather than silently rewriting state.
- Preserve existing fail-closed behavior for action checks.

**Non-Goals:**

- Change approval, denial, activation, pause, resume, termination, or expiration semantics outside permission revocation.
- Add any remote action implementation, native Windows APIs, relay behavior, reconnect behavior, installer/service behavior, credential access, privilege elevation, hidden sessions, or security prompt bypass.

## Decisions

1. Add guards inside `revokeSessionPermission`.
   - Rationale: this function is the shared state-machine entrypoint; callers should not have to duplicate lifecycle checks.
   - Alternative considered: leave callers responsible. Rejected because future native adapters need one consistent authorization contract.

2. Treat revocation of a missing permission as an error.
   - Rationale: a no-op revoke can hide caller bugs and ambiguous audit trails. Explicit failure is easier to test and audit.
   - Alternative considered: return the original authorization unchanged. Rejected because revocation is security-relevant host control.

3. Preserve paused state for partial revocation.
   - Rationale: pause is non-terminal and already denies action checks. Removing one permission during pause should keep the remaining grant paused until explicit resume.
   - Alternative considered: force active state after partial revoke. Rejected because that would weaken host pause semantics.

## Risks / Trade-offs

- [Risk] Existing callers might rely on no-op revocation. -> Mitigation: current codebase only uses revocation after visible activation; tests now document the stricter contract.
- [Risk] Termination or expiration cleanup might want to remove permissions later. -> Mitigation: terminal states already fail closed; cleanup should be modeled separately rather than as host permission revocation.
