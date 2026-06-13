## Context

The agent shell is a non-native protocol exerciser. It can simulate host approval, visible-session indicator events, revocation, pause/resume, termination, expiration, and local disconnect. The current public `send()` flow checks remote disconnect and explicit local disconnect simulation before validating message authority and signal authorization, then `sendProtocol()` checks that the WebSocket is open before encoding and writing.

When the transport closes for other reasons, the close handler emits a redacted `closed` event and deactivates the host indicator, but it does not mark `localPeerDisconnected`. That means later public sends can do message-specific validation before ultimately failing on the socket-open guard.

## Goals / Non-Goals

**Goals:**

- Treat local WebSocket close as a local disconnected state for public send gating.
- Ensure public sends after local socket close fail before protocol validation, socket write, and local `sent` event emission.
- Keep diagnostics bounded and secret-safe.
- Preserve existing runtime restart behavior: `start()` resets connection-scoped state.

**Non-Goals:**

- No automatic reconnect.
- No change to trusted remote peer disconnect handling.
- No native Windows capture, input, installer, service, persistence, or privilege behavior.

## Decisions

1. Set `sessionState.localPeerDisconnected = true` in the socket close handler.

   Rationale: the local transport is no longer usable. Treating the close as local disconnect is a clear terminal state for public sends and delayed workflow sends until a fresh `start()` resets connection-scoped state.

2. Keep the existing public `send()` guard order with `localPeerDisconnected` before message-specific checks.

   Rationale: this avoids inspecting caller-provided protocol payload details after the lifecycle is already terminal and preserves the existing bounded error text.

3. Do not reset all connection-scoped state in the close handler.

   Rationale: indicator and closed events still need stable lifecycle metadata, and `stop()`/`start()` already owns full reset boundaries.

## Risks / Trade-offs

- [Risk] Delayed workflow logs after unexpected socket close may change from "socket is closed" to "local peer disconnected." -> Mitigation: both are bounded lifecycle diagnostics; the new text is more explicit for the terminal state.
- [Risk] Existing callers may rely on the lower-level socket-open error after close. -> Mitigation: public sends after close were already invalid; the new error is a stronger lifecycle-specific denial.
