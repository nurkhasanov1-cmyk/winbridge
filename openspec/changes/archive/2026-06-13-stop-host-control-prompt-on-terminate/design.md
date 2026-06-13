## Context

The host control prompt is a non-native development surface for host-only
lifecycle controls. Existing runtime gates already require active or paused
visible authorization for direct termination, send the bound session-control,
authorization-state, and audit-event messages, and deactivate the host
indicator when termination succeeds. The prompt currently remains open after
that successful terminal transition.

## Goals / Non-Goals

**Goals:**

- Close the host control prompt after a successful exact `terminate` command.
- Preserve failed-termination error reporting and keep the prompt available
  after failure.
- Preserve existing behavior for `help`, `status`, `pause`, `resume`,
  `revoke`, and `disconnect`.
- Avoid sending any additional protocol, lifecycle, signal, control, audit,
  viewer leave, public-send, or direct protocol construction because of prompt
  shutdown.

**Non-Goals:**

- No protocol changes.
- No relay changes.
- No native Windows UI or background service behavior.
- No screen capture, input injection, reconnect, unattended access, or hidden
  session capability.
- No change to the managed runtime termination authorization/audit sequence.

## Decisions

1. Stop the prompt only after `runtime.terminate()` returns without throwing.
   - Rationale: successful termination is a terminal host-visible session
     action. Closing the prompt then avoids presenting a usable local control
     surface for a session that has ended.
   - Alternative considered: stop before invoking termination. Rejected because
     audit or authorization failures must keep the operator in a recoverable
     prompt state.

2. Reuse the existing prompt-local stop callback used by host disconnect.
   - Rationale: readline lifecycle is terminal UI state and should remain
     decoupled from runtime authorization internals.
   - Alternative considered: have `runtime.terminate()` signal UI shutdown.
     Rejected because runtime controls should not depend on terminal prompt
     state.

## Risks / Trade-offs

- Risk: stopping after `terminate` could hide status output that was previously
  available. Mitigation: failed termination keeps `status` available, and the
  accepted termination line itself remains visible.
- Risk: prompt shutdown could be confused with additional lifecycle signaling.
  Mitigation: tests assert no unrelated runtime controls, viewer leave, public
  sends, or status reads occur after prompt shutdown.
- Risk: dispatch tests that send multiple commands through one input stream
  could mask prompt shutdown behavior. Mitigation: split terminal and
  non-terminal prompt tests so each lifecycle boundary is asserted directly.
