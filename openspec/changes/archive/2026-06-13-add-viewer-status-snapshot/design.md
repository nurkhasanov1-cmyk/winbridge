## Context

`AgentShellRuntime` currently exposes `getHostStatus()` for host runtimes. That method is read-only and summarizes the host indicator/authorization state without sending messages or invoking controls. Viewer runtimes maintain `sessionState.viewerAuthorization` for authorization decisions, state updates, pause, revoke, and termination handling, but that state is only observable indirectly through events.

## Decision

Add `getViewerStatus()` to `AgentShellRuntime` with a snapshot shape parallel to host status:

- `state`: `active`, `paused`, or `inactive`;
- `visibleToHost`: whether the active/paused authorization is host-visible;
- `permissionCount`: current granted permission count only when the viewer has active or paused visible authorization;
- optional `authorizationId`;
- optional `authorizationStatus`.

Viewer status is viewer-only. Host runtimes reject the call with a bounded error. The snapshot reads only `sessionState.viewerAuthorization`; it does not send protocol messages, emit runtime events, write audit records, alter local authorization state, or trigger host lifecycle controls.

## Safety Invariants

- Pending, approved, denied, revoked, terminated, expired, invisible, or missing viewer authorization reports `state: "inactive"` and `permissionCount: 0`.
- Paused viewer authorization reports `state: "paused"` but remains non-authorizing for signal sends.
- The snapshot omits peer ids, display names, permission names, reasons, protocol payloads, tokens, pairing codes, and signal payload contents.
- Status reads do not change host consent, visibility, authorization, revocation, pause, resume, termination, capture, input, reconnect, or disconnect behavior.

## Verification

- Add integration coverage for inactive, approved-but-invisible, active, paused, and terminal viewer statuses.
- Verify status reads do not emit additional `sent` events.
- Verify host runtimes reject viewer status reads.
- Run focused runtime tests and standard repository verification.
