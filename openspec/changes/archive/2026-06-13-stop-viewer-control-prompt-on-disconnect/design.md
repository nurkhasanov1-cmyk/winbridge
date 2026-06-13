## Context

The viewer control prompt is a non-native development surface for viewer-local
status checks and local disconnect. Existing runtime gates already keep
`leave()` viewer-only: it closes the viewer's local transport without forging
host lifecycle messages or granting remote access. The prompt currently calls
the prompt-local stop callback before awaiting `runtime.leave()`, so failures
close the recovery surface too early.

## Goals / Non-Goals

**Goals:**

- Close the viewer control prompt after a successful exact `disconnect`
  command.
- Preserve failed-disconnect error reporting and keep the prompt available
  after failure.
- Preserve existing behavior for `help` and `status`.
- Avoid sending any new protocol, lifecycle, signal, control, audit, host
  control, or public-send messages because of prompt shutdown.

**Non-Goals:**

- No protocol changes.
- No relay changes.
- No native Windows UI or background service behavior.
- No screen capture, input injection, reconnect, unattended access, or hidden
  session capability.

## Decisions

1. Stop the prompt only after `runtime.leave()` resolves.
   - Rationale: successful local viewer leave means the local control surface no
     longer represents an active viewer session. Closing the prompt then avoids
     stale-looking input.
   - Alternative considered: keep stopping before `leave()`. Rejected because a
     failed local leave should leave the operator with a visible recovery path.

2. Preserve the existing prompt-local stop callback.
   - Rationale: readline lifecycle remains local UI state, separate from
     managed runtime transport state.
   - Alternative considered: make the runtime own prompt shutdown. Rejected
     because runtime controls should not depend on terminal UI details.

## Risks / Trade-offs

- Risk: accepted output could race with prompt shutdown. Mitigation: focused
  tests wait for accepted output and then assert later input is ignored.
- Risk: failed `leave()` could still close the prompt. Mitigation: regression
  coverage sends `status` after a throwing `leave()`.
- Risk: prompt shutdown could be mistaken for a remote lifecycle action.
  Mitigation: keep shutdown local to readline and assert no host lifecycle
  controls, public sends, or direct protocol construction are invoked.
