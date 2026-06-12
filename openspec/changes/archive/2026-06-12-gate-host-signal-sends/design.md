## Context

The development agent shell is a protocol simulator, not a native capture/input client. `signal` messages model future transport setup, so both directions should stay fail-closed until the host has explicitly approved and emitted visible active session state. Existing viewer and host-inbound gates cover viewer-originated sends and host receives. The remaining gap is the public host `send()` path.

## Goals / Non-Goals

**Goals:**

- Block host public runtime `signal` sends unless the local host authorization snapshot is active, visible, unexpired, and grants `screen:view`.
- Preserve redacted local diagnostics for blocked sends by rejecting before socket write and before local `sent` event emission.
- Keep valid host sends after active visible grant working, including redacted signal payload summaries.

**Non-Goals:**

- No protocol schema changes.
- No relay behavior changes.
- No native screen capture, input, clipboard, file transfer, installer, startup, service, persistence, privilege elevation, hidden session, or Windows prompt behavior.

## Decisions

- Reuse the existing `hasActiveSignalAuthorization` predicate for host public sends.
  - Rationale: the same safety condition already gates viewer sends and host inbound signals.
  - Alternative considered: add a separate host-only predicate. Rejected because it would duplicate consent logic and risk drift.
- Keep the gate in `AgentShellRuntime.send()`.
  - Rationale: public direct sends should fail before socket write and before local `sent` event emission; internal workflow sends are still controlled by their existing host decision, visible session, timer, and peer-disconnect checks.
- Use the existing blocked signal error string.
  - Rationale: it avoids exposing payload data and keeps caller-facing behavior consistent across signal send gates.

## Risks / Trade-offs

- [Risk] Existing tests that used host `signal` as a generic redaction sample need an active visible grant first.
  - Mitigation: update those tests to perform the consent workflow before host signal sends.
- [Risk] A future non-screen signaling purpose may need a different permission.
  - Mitigation: keep this scoped to current `screen:view` transport semantics and require a future OpenSpec change for new signal permissions.
