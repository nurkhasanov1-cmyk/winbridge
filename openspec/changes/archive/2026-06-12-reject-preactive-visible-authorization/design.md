## Context

The state machine uses `approved` to mean host consent exists but no active
visible session has been emitted. `active` and `paused` are the only non-terminal
states that represent a visible host session. Current validation enforces
visibility for `active`/`paused`, but it does not reject `visibleToHost: true`
on `pending` or `approved`.

## Goals / Non-Goals

**Goals:**

- Make pre-active authorization states unambiguous by rejecting
  `visibleToHost: true` on `pending` and `approved`.
- Apply the same invariant to protocol `session-authorization-state` messages.
- Preserve terminal states, which may originate from a previously visible
  session and remain fail-closed.
- Keep action authorization behavior unchanged: only active, visible, unexpired,
  scoped grants authorize sensitive actions.

**Non-Goals:**

- Do not alter approval, activation, pause, resume, revocation, termination, or
  expiration lifecycle transitions beyond schema validation.
- Do not add native screen capture, input, clipboard, file transfer, services,
  startup persistence, installers, or privilege behavior.

## Decisions

- Add explicit schema issues for `pending` and `approved` states with
  `visibleToHost: true`. Alternative considered: force the value to `false`, but
  rejection is safer because malformed sender/adapter behavior should fail
  before it becomes state.
- Keep terminal states independent from this invariant. A terminal state can be
  emitted after an active visible session was revoked, terminated, or expired;
  it remains fail-closed because terminal records carry no permissions.
- Update both record-level and protocol-level schemas so future native adapters
  cannot bypass the invariant by consuming protocol messages directly.

## Risks / Trade-offs

- Existing development callers that construct approved visible states will fail
  validation -> mitigation: the intended lifecycle is approved first, then active
  visible only after activation.
- This does not prove a real UI indicator exists -> mitigation: native UI remains
  a future OpenSpec change; this change prevents pre-active states from claiming
  that indicator prematurely.
