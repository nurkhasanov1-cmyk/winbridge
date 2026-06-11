## Why

The shared session authorization state machine stores requested permissions in the pending authorization, but `approveSessionAuthorization` currently accepts any granted permission list. That could allow a host approval flow or future adapter bug to grant permissions the viewer did not request.

Consent-first remote assistance should keep the granted scope bounded by the viewer's explicit request and the host's explicit approval.

## What Changes

- Require pending authorization requests to include at least one requested permission.
- Restrict approved grants to a non-empty subset of the pending requested permissions.
- Reject duplicate granted permissions to keep grant scope and audit counts unambiguous.
- Add focused authorization state-machine tests for subset approval and overgrant rejection.
- Document that host approval may narrow but must not expand requested scope.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-authorization`: Hardens approval grant scope in the shared authorization state machine.

## Impact

- Affected code: `packages/protocol/src/authorization.ts`, authorization tests, docs, and OpenSpec specs.
- Safety impact: prevents accidental or malicious overgranting beyond the viewer's request before native remote actions exist.
- Touches authorization behavior and permission grant semantics; requires security review.
- Non-goals: screen capture, input injection, clipboard sync, file transfer, reconnect, relay behavior, installer behavior, services, startup persistence, credential access, privilege elevation, hidden sessions, or Windows prompt bypass.
