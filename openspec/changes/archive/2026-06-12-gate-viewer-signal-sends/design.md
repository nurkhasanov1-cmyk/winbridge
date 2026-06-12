## Context

`apps/agent-shell` is currently a non-native protocol exerciser. It does not capture screens, inject input, sync clipboard, transfer files, or run as a background service. The runtime still exposes a direct `send()` method used by tests and future callers to send protocol envelopes, including `signal` messages.

`signal` payloads are already bounded and redacted, but viewer-originated signaling is the path future viewer-side remote-assistance actions are most likely to use. Before native or WebRTC work starts, the viewer runtime should fail closed unless it has observed host-approved active visible authorization.

## Goals / Non-Goals

**Goals:**

- Track the viewer's latest host-originated authorization lifecycle snapshot inside `AgentShellSessionState`.
- Require active, visible, unexpired `screen:view` authorization before a viewer can send a `signal` envelope.
- Fail closed after denial, pause, termination, expiration, peer disconnect, or `screen:view` revocation.
- Keep blocked-send diagnostics secret-safe and avoid local `sent` events for blocked signals.

**Non-Goals:**

- Do not implement screen capture, remote input, clipboard sync, file transfer, WebRTC, native Windows UI, services, startup persistence, or production identity.
- Do not change relay forwarding rules or protocol wire schemas.
- Do not grant permissions from pairing, `hello`, `relay-ready`, authorization decisions, or audit events alone.

## Decisions

1. **Track a minimal viewer authorization snapshot in agent-shell state.**
   - Store only authorization id, status, visibility, permissions, and expiration from inbound `session-authorization-state`.
   - Use `session-authorization-decision` denials, `permission-revoked`, and pause/terminate controls to move the snapshot toward fail-closed states before the paired state update arrives.
   - Alternative considered: require callers to pass a full `SessionAuthorization` record. That does not match the current wire-only agent shell workflow.

2. **Use `screen:view` as the required permission for viewer-originated `signal` sends.**
   - Today the safe signaling channel is the only transport-like path in the agent shell and is most closely tied to future screen viewing.
   - Future input/file/clipboard transports can introduce explicit action-specific send APIs in separate OpenSpec changes.
   - Alternative considered: inspect signal payload keys for required permission. That would be fragile and would couple authorization to arbitrary payload naming.

3. **Block before socket writes and local `sent` events.**
   - The guard runs in the public runtime `send()` path before `sendProtocol()`.
   - The thrown error is generic and does not include protocol payloads or private metadata.
   - Existing inbound redaction behavior is unchanged.

## Risks / Trade-offs

- [Risk] Blocking all viewer-originated `signal` sends before `screen:view` may be stricter than future pre-consent transport negotiation.
  Mitigation: this is a development shell default. Future WebRTC design can split pre-consent signaling from authorized media/control channels under a dedicated OpenSpec change.
- [Risk] Runtime state may see paired lifecycle messages in different order.
  Mitigation: only host state updates can activate the gate; controls and revocations fail closed immediately, while resume does not reopen the gate until an active state update arrives.
- [Risk] The low-level host `send()` path remains useful for tests.
  Mitigation: this change scopes enforcement to viewer-originated `signal` sends, the direction that would initiate remote assistance actions.
