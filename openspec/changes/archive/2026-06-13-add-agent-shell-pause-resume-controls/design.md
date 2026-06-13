## Context

The non-native agent shell is the current development surface for consent workflow behavior. It can emit pause/resume lifecycle messages by timer after visible activation, but a future native host UI needs direct controls that can pause and resume immediately while preserving the same authorization and audit gates.

Delayed workflow state is currently local to the authorization-request handler. Direct controls must share that state so later delayed revoke, terminate, expiration, or scheduled pause/resume work cannot observe stale pause status or permission scope.

## Goals / Non-Goals

**Goals:**

- Add direct host-only `pause()` and `resume()` runtime methods.
- Gate pause on active visible unexpired authorization and resume on paused visible unexpired authorization.
- Reuse the existing pause/resume protocol sequence: `session-control`, `session-authorization-state`, local indicator update, and `audit-event`.
- Preserve audit fail-closed behavior for pause/resume messages.
- Store current host workflow state in the session state so direct and delayed controls remain coherent.

**Non-Goals:**

- No screen capture, input injection, clipboard sync, file transfer, diagnostics collection, reconnect, installer, startup, service, native Windows API, or privilege-elevation work.
- No viewer-side pause/resume controls.
- No direct permission revoke control in this change.
- No relay routing or protocol schema changes.

## Decisions

1. **Expose `pause()` and `resume()` on the managed runtime API only.**
   - Rationale: this provides a future UI hook without adding a new CLI interaction model.
   - Alternative considered: add terminal key commands. Rejected because the current CLI is a protocol exerciser, not a UI shell.

2. **Share host workflow state through `AgentShellSessionState`.**
   - Rationale: direct controls and delayed timers need one source of truth for paused state, terminal state, and current permission scope.
   - Alternative considered: derive everything from `hostAuthorization`. Rejected because delayed revoke/terminate timers already depend on `HostWorkflowState` and would otherwise diverge.

3. **Keep pause/resume audit fail-closed.**
   - Rationale: unlike local disconnect, pause/resume send lifecycle protocol messages. If local audit persistence fails, the runtime must surface a sanitized failure and send no control/state/audit messages.
   - Alternative considered: best-effort audit like local disconnect. Rejected because pause/resume do not require closing access as urgently as disconnect and already have existing audit-first semantics.

4. **Use existing configured/default reasons.**
   - Rationale: direct controls can reuse the current default reason text and configured reason options without introducing new user input or unsafe runtime strings.
   - Alternative considered: accept arbitrary reason strings as method parameters. Rejected for this increment because it would add a new validation surface.

## Risks / Trade-offs

- [Risk] Direct controls could be called from viewer runtimes. -> Mitigation: role checks reject before socket writes or audit writes.
- [Risk] Direct pause/resume could run before visible consent. -> Mitigation: state-specific authorization checks reject before messages.
- [Risk] Audit sink failures could leak raw local errors. -> Mitigation: report sanitized runtime diagnostics and throw a generic runtime error.
- [Risk] Direct controls could conflict with delayed timers. -> Mitigation: both paths update the same host workflow state; later timers observe current paused/terminal state.
