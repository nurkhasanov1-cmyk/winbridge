## Context

`packages/protocol` owns the shared authorization state machine used by the development shell and future Windows clients. Current terminal schemas already require empty permission lists, but helper behavior still needs tighter lifecycle boundaries: expiration checks should not overwrite terminal history, and termination should not be accepted from states that never represented a visible live session.

This change touches authorization behavior only. It does not add capture, input, native Windows, relay, installer, startup, service, token, credential, or privilege behavior.

## Goals / Non-Goals

**Goals:**

- Make `expireSessionAuthorization` idempotent for terminal states.
- Require `terminateSessionAuthorization` to operate only on visible, unexpired `active` or `paused` authorizations.
- Keep action authorization fail-closed for every terminal state.
- Preserve lifecycle timestamps and reasons for audit review.

**Non-Goals:**

- No new authorization states or permissions.
- No changes to relay signaling or agent-shell workflow timing.
- No production authentication, storage, Windows UI, capture, or input implementation.
- No stealth, persistence, credential access, keylogging, evasion, or Windows prompt bypass behavior.

## Decisions

1. Preserve terminal records before expiration mutation.

   `expireSessionAuthorization` will parse input, return denied/revoked/terminated/expired records unchanged, then only expire non-terminal records whose TTL has elapsed. Alternative considered: always normalize to `expired` after TTL. That would keep action checks closed, but it destroys the original host denial/revoke/terminate reason and timestamp, which weakens audit history.

2. Constrain termination to live visible states.

   `terminateSessionAuthorization` will reject anything other than visible, unexpired `active` or `paused` authorizations. Alternative considered: allow termination from any non-terminal state as a generic cleanup marker. That can misrepresent pending/approved requests as terminated live sessions and can create confusing lifecycle history after denial or expiration.

3. Keep implementation in shared protocol helpers.

   The development shell already suppresses late simulated events after terminal states. The stricter shared helper behavior keeps future clients from accidentally bypassing those lifecycle constraints.

## Risks / Trade-offs

- Existing callers that used termination as a generic cleanup marker for pending or approved requests will now receive an error. Mitigation: callers should use denial, expiration, or peer-disconnect workflow state for non-live cleanup.
- Returning terminal records unchanged means `expiredAt` is not added to a denied/revoked/terminated record after TTL. Mitigation: terminal state already denies actions and preserves the stronger causal event for audit.
- The stricter helper may reveal missing tests in callers. Mitigation: add focused protocol coverage and run the full verification gate.

## Migration Plan

No data migration is required. The change is source-compatible at the type level and stricter at runtime for unsafe lifecycle transitions. Rollback is a normal code revert if an internal caller depends on the rejected transitions.

## Open Questions

None.
