## Context

The agent shell can now send a viewer-side static signal probe after active visible `screen:view` authorization. A safe round-trip requires the host to acknowledge that probe without introducing WebRTC SDP/ICE, screen frames, input events, native capture, or arbitrary signal payloads.

## Goals / Non-Goals

**Goals:**

- Add an opt-in host-only acknowledgement for trusted viewer signal probes.
- Send at most one acknowledgement per authorization id.
- Route the acknowledgement through the public runtime `send()` path so existing signal authorization, routing, payload validation, disconnect, pause, revoke, termination, expiration, and event redaction gates remain authoritative.
- Keep acknowledgement payloads static and secret-safe.

**Non-Goals:**

- No WebRTC peer connection setup, SDP, ICE candidates, screen capture, frame transport, remote input, clipboard sync, file transfer, diagnostics upload, reconnect, native Windows UI, installer, service, startup persistence, or privilege elevation.
- No viewer-side acknowledgement mode.
- No user-provided acknowledgement payload or arbitrary JSON.

## Decisions

1. **Use a host-only boolean CLI/runtime option.**
   - Add `--host-signal-probe-ack true|false`, defaulting to `false`.
   - Reject any explicit use on viewer runtimes before startup.
   - Alternative considered: always acknowledge viewer probes. Rejected because signaling behavior should stay opt-in during development.

2. **Acknowledge only trusted inbound probe messages.**
   - The host sees inbound `signal` events only after existing inbound signal gates confirm active visible `screen:view` authorization and matching `authorizationId`.
   - Ack logic checks the parsed payload for the static viewer probe marker and ignores all other signals.
   - Alternative considered: ack any inbound signal. Rejected because it could create a broad automatic response surface.

3. **Reuse public `send()`.**
   - The host acknowledgement is sent through the same internal helper used by public runtime `send()`.
   - No socket writes or protocol messages are constructed from CLI code.
   - Existing runtime gates reject stale state after pause, revoke, termination, expiration, local disconnect, remote disconnect, missing recipient, or routing mismatch.

4. **Use a static payload and one ack per authorization id.**
   - Payload shape is limited to `{ authorizationId, probeAck: "host-signal-probe-ack-v1" }`.
   - Runtime state records the last acknowledged authorization id and clears it on connection-scoped reset.
   - This prevents repeated acknowledgements if a peer repeats the same probe.

## Risks / Trade-offs

- [Risk] Automatic ack could respond after lifecycle loss. -> Send through public runtime gates and add regression tests for pause/revoke/termination/expiration/disconnect before ack.
- [Risk] Probe matching could expose or log raw signal payloads. -> Match only in memory and keep local events/logs on the existing redacted signal path.
- [Risk] Ack might be mistaken for WebRTC signaling. -> Document it as static development probe acknowledgement with no SDP, ICE, media, input, clipboard, file, or diagnostics content.
