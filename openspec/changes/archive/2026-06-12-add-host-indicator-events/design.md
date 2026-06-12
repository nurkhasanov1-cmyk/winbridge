## Context

The agent shell currently emits protocol events and audit records for visible activation, pause, resume, revoke, terminate, expiration, and disconnect simulation. Future Windows host UI will need a local surface to drive the visible active-session indicator, but the bootstrap only exposes `visibleToHost` as protocol state and logs protocol summaries.

This change adds a local, secret-safe indicator event surface in the non-native host runtime. It is a development UI contract, not a wire protocol change and not a native Windows implementation.

## Goals / Non-Goals

**Goals:**

- Emit local host indicator events when visible session state becomes active after explicit approval.
- Update the indicator when the host workflow pauses, resumes, partially revokes permissions, finally revokes, terminates, expires, locally disconnects, stops, closes its socket, or observes the remote peer disconnecting.
- Emit only secret-safe metadata: authorization id, authorization status, indicator state, visible flag, permission count, and bounded cause.
- Keep signal authorization and protocol lifecycle checks as the only sensitive-action gates.

**Non-Goals:**

- No native Windows UI, tray icon, notification, capture, input, clipboard, file transfer, installer, service, startup persistence, privilege elevation, unattended access, or Windows prompt behavior.
- No relay or protocol schema changes.
- No production account identity or durable production audit storage.

## Decisions

- Add an `AgentShellEvent` variant with `direction: "indicator"` for host indicator updates.
  - Rationale: tests and future UI adapters already consume runtime events; adding a local event avoids changing wire protocol messages.
  - Alternative considered: infer indicator state from sent protocol events. That would force UI code to duplicate lifecycle rules and would miss local disconnect/stop deactivation.
- Include a bounded `cause` enum instead of raw lifecycle reason text.
  - Rationale: UI and tests need to know why the indicator changed, while private host reasons remain redacted.
- Treat terminal authorization statuses, disconnect, runtime stop, and socket close as inactive indicator states.
  - Rationale: visible status must fail closed when the host can no longer provide an active session, even if no new protocol state can be sent after disconnect.
- Do not let indicator state authorize `signal` sends or inbound signals.
  - Rationale: indicator state is a UI surface only; authorization remains bound to active, visible, unexpired permission state.

## Risks / Trade-offs

- [Risk] Local UI code may accidentally treat indicator events as authorization.
  - Mitigation: specs and docs state that indicator events are not grants, and existing signal gates remain unchanged.
- [Risk] Repeated lifecycle updates could spam indicator events.
  - Mitigation: runtime stores the last emitted indicator snapshot and suppresses exact duplicates.
- [Risk] Deactivation on runtime stop or socket close may appear in tests during cleanup.
  - Mitigation: emit only when a host indicator was previously active/paused, and keep event metadata small and deterministic.
