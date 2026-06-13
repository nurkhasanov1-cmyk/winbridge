## Context

The agent shell currently has:

- Host-only `disconnect()` control that requires active or paused visible host authorization, deactivates the host indicator, writes local host audit metadata, and closes the host WebSocket.
- CLI `--disconnect-after-ms`, which exercises that host-only control after visible activation.
- Generic `runtime.stop()`, which closes the local runtime socket without constructing lifecycle protocol messages.

Viewer UI will eventually need a local "leave session" control. That control is not a host lifecycle authority action and should not share the host-only `disconnect()` path.

## Goals / Non-Goals

**Goals:**

- Add `--viewer-disconnect-after-ms <delay>` for viewer CLI runs.
- Validate the delay as an exact integer from `0` through `2147483647`.
- Reject the option on host runs before relay startup.
- Close only the local viewer runtime by calling `runtime.stop()` after the delay.
- Keep remaining-peer notification relay-observed: the viewer must not send `peer-disconnected` itself.
- Verify the host receives the relay-originated `peer-disconnected` notice when the scheduled viewer leave occurs in an integration run.

**Non-Goals:**

- No change to host `disconnect()` semantics.
- No public viewer lifecycle control method on `AgentShellRuntime`.
- No screen capture, input injection, clipboard sync, file transfer, diagnostics collection, reconnect, native UI, installer/startup/service behavior, token handling, authentication, relay authorization, or privilege behavior.
- No viewer workflow audit event, because leaving locally is not a host authorization decision or sensitive remote action.

## Decisions

1. Use a CLI scheduler around `runtime.stop()` instead of expanding `runtime.disconnect()`.

   `runtime.disconnect()` is intentionally host-only and tied to visible host authorization, indicator deactivation, and host workflow audit. A viewer leave operation is local shutdown, not host lifecycle authority. Keeping it outside `runtime.disconnect()` prevents accidental host-control expansion.

   Alternative considered: allow `disconnect()` for viewers. Rejected because the method name already represents host local disconnect control in existing tests and specs.

2. Use a one-shot delayed option rather than an interactive viewer prompt.

   The existing shell uses one-shot delay options for deterministic development exercises. This keeps tests simple and avoids a second stdin prompt surface.

   Alternative considered: interactive viewer prompt. Rejected for this increment because it adds prompt lifecycle complexity without improving consent or authorization coverage.

3. Do not require requested permissions or active authorization.

   A viewer can leave a session before or after authorization. Closing the viewer's own connection does not expose host data or execute a remote action.

   Alternative considered: require active visible authorization. Rejected because a local leave control must also work before consent is granted.

## Risks / Trade-offs

- [Risk] A future reader could mistake viewer leave for host-authorized session termination. -> Mitigation: naming, specs, docs, and implementation state that this closes only the local viewer runtime and relies on relay-observed disconnect notices.
- [Risk] Calling `runtime.stop()` while other viewer timers are pending could race with a signal probe. -> Mitigation: `runtime.stop()` closes the socket and existing send gates fail closed when the local peer is stopped or disconnected.
- [Risk] Error output could leak raw exception text. -> Mitigation: the scheduler formats failures with existing sanitized CLI diagnostics.
