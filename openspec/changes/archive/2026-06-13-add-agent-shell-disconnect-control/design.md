## Context

The non-native agent shell exercises consent and lifecycle protocol behavior before native Windows UI exists. It already has a delayed host disconnect simulation that deactivates the local host indicator, marks the local peer disconnected, and closes the WebSocket so the relay remains the sole source of `peer-disconnected` notices.

That path is safety-critical because it is the development stand-in for the future host's immediate disconnect button. Unlike approval, revocation, pause/resume, termination, and expiration, local disconnect currently lacks its own audit action. It also has no direct managed-runtime API for UI code or tests to trigger the same path without timer configuration.

## Goals / Non-Goals

**Goals:**

- Add a direct host-only `disconnect()` runtime method for local host disconnect control.
- Reuse one implementation for direct disconnect and delayed disconnect simulation.
- Deactivate the host indicator and close the WebSocket immediately for local disconnect.
- Persist a secret-safe local audit record for `agent-shell.session.disconnected` when an audit sink is configured.
- Surface audit sink failures as sanitized runtime errors while preserving immediate disconnect.
- Keep `peer-disconnected` relay-originated only.

**Non-Goals:**

- No screen capture, input injection, clipboard sync, file transfer, diagnostics collection, reconnect, installer, startup, service, native Windows API, or privilege-elevation work.
- No production identity, account binding, or durable audit service.
- No viewer-side disconnect control in this change.
- No change to relay routing or relay `peer-disconnected` authority.

## Decisions

1. **Expose `disconnect()` only on the managed runtime API.**
   - Rationale: future host UI code needs a direct control hook, but the current CLI can keep using the existing delayed simulation option.
   - Alternative considered: add a CLI keybinding or command loop. Rejected because that would add interactive terminal behavior outside the current protocol exerciser scope.

2. **Require active or paused visible host authorization before local disconnect emits lifecycle audit.**
   - Rationale: local disconnect is meaningful as a host session control only after explicit visible activation. Calling it before visible activation must fail closed without creating audit evidence of a session that never became active.
   - Alternative considered: allow disconnect at any time as a transport close. Rejected for this API because it would blur host session control with generic runtime stop behavior.

3. **Audit best-effort, disconnect mandatory.**
   - Rationale: a host disconnect control must not be delayed or blocked by local audit persistence failure. The runtime should surface the sanitized error and still deactivate the indicator and close the socket.
   - Alternative considered: block disconnect when audit persistence fails, matching other lifecycle messages. Rejected because immediate host revocation of access has priority over development audit persistence for this local close-only action.

4. **Keep relay as the only source of `peer-disconnected`.**
   - Rationale: peer disconnect notices are broker-observed lifecycle metadata. A peer-originated notice could spoof lifecycle state.
   - Alternative considered: have the agent shell send `peer-disconnected` before closing. Rejected because existing relay authority boundaries prohibit forged disconnect notices.

## Risks / Trade-offs

- [Risk] Public `disconnect()` could be called from viewer runtime code. -> Mitigation: throw before socket close unless `role` is `host`.
- [Risk] Public `disconnect()` before visible activation could be confused with a consented session disconnect. -> Mitigation: throw and do not close through this control until the host has active or paused visible authorization.
- [Risk] Audit write failure could hide local audit evidence. -> Mitigation: emit sanitized runtime error with byte length and still close immediately; tests cover both close and redaction.
- [Risk] Duplicate close events could emit duplicate inactive indicators. -> Mitigation: reuse existing indicator de-duplication and local disconnected state.
