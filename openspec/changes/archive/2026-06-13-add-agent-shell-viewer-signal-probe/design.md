## Context

The agent shell can already authorize a viewer and forward schema-valid `signal` messages through the relay, but only test code can currently exercise that path. The next media-transport step needs a safe CLI-level probe that verifies consent-bound signaling without introducing WebRTC SDP/ICE, screen frames, input events, native capture, or user-provided signaling payloads.

## Goals / Non-Goals

**Goals:**

- Add a viewer-only development probe that sends one static `signal` payload after active visible `screen:view` authorization.
- Keep the probe behind explicit CLI/runtime configuration and strict timer validation.
- Reuse public runtime `send()` so authorization id binding, recipient routing, signal payload validation, local/remote disconnect gates, and redacted runtime events remain authoritative.
- Suppress or fail closed after pause, revocation, termination, expiration, missing `screen:view`, local disconnect, or remote disconnect.

**Non-Goals:**

- No WebRTC implementation, SDP, ICE candidates, peer connection setup, screen capture, frame transport, remote input, clipboard sync, file transfer, diagnostics upload, reconnect, native Windows UI, installer, service, startup persistence, or privilege elevation.
- No host-side probe in this increment.
- No user-provided signal payload, payload marker, display text, or arbitrary JSON from the CLI.

## Decisions

1. **Use a viewer-only CLI flag.**
   - Add `--viewer-signal-probe-after-ms <delay>` as an opt-in timer.
   - Reject the flag for host runtimes and when the viewer did not request `screen:view`.
   - Use the existing exact integer timer semantics and safe JavaScript timer bound.
   - Alternative considered: allow host and viewer probes. Rejected for this increment to keep the first media-transport probe scoped to the viewer offer direction.

2. **Schedule from the managed runtime after authorization becomes active.**
   - The runtime already tracks the viewer authorization snapshot and observed host authority.
   - The probe timer starts only after the viewer receives active visible authorization with `screen:view`.
   - Timer callbacks call the same public `send()` path used by tests rather than writing protocol messages directly.
   - Alternative considered: construct and send the probe inside the CLI. Rejected because the CLI does not own authorization state and would risk duplicating runtime gates.

3. **Use a static payload.**
   - Payload shape is limited to `{ authorizationId, probe: "viewer-signal-probe-v1" }`.
   - The authorization id is the current non-secret lifecycle binding required by existing `signal` validation.
   - No user-provided marker or arbitrary JSON is accepted, preventing accidental token, clipboard, file, diagnostics, screen, or input data in the probe.

4. **Treat failed probes as sanitized runtime failures.**
   - If lifecycle state changes before the timer fires, public `send()` rejects before socket write and before local `sent` event emission.
   - Timer errors are reported through existing runtime error diagnostics, which expose generic message-byte metadata only.

## Risks / Trade-offs

- [Risk] A probe timer can become stale after pause, revoke, termination, expiration, or disconnect. -> Reuse public `send()` gates and add regression tests proving no `signal` is emitted in revoked or disconnected states.
- [Risk] A CLI payload option would be convenient for manual experiments but could leak secrets. -> Do not add payload customization in this increment.
- [Risk] Probe behavior could be mistaken for media transport. -> Document it as a development signal-only probe that sends no screen, input, clipboard, file, diagnostics, SDP, or ICE contents.
