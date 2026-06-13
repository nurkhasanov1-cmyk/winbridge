## Context

The agent shell records `localPeerDisconnected` in the shared WebSocket close handler. Host status already uses local indicator deactivation to become inactive after socket close. Viewer status currently derives from `viewerAuthorization` unless the runtime observed a trusted remote host disconnect, so an unexpected local socket close can leave a stale active-looking status snapshot.

## Goals / Non-Goals

**Goals:**

- Make viewer status fail closed when the local viewer transport closes outside explicit leave/ordinary stop.
- Surface only bounded local cause metadata: `localInactiveCause=socket-closed`.
- Keep explicit local leave as `localInactiveCause=local-leave`.
- Keep trusted remote host disconnect precedence so `remoteDisconnectReasonCode` remains the remote-disconnect metadata path.

**Non-Goals:**

- Do not send new protocol messages or relay-originated notices.
- Do not write workflow audit records for local viewer socket close.
- Do not add reconnect behavior, capture, input, clipboard, file transfer, diagnostics dumps, installer behavior, services, startup persistence, token handling, or privilege elevation.
- Do not expose raw close reason text, peer ids, display names, private reasons, protocol payloads, signal payloads, or authorization metadata from the closed local scope.

## Decisions

- Extend `AgentShellViewerLocalInactiveCause` to include `socket-closed`.
  Alternative: reuse `local-leave`. That would hide an important distinction between explicit user leave and transport loss.
- Record the local cause in the close handler only for viewer runtimes when the close is not expected from managed `stop()`/`leave()` and no trusted remote host disconnect has already been recorded.
  Alternative: record cause on every close. That would make ordinary cleanup and explicit leave look like socket failures.
- Clear `viewerAuthorization` for this local socket-close status path.
  Alternative: preserve authorization id/status as diagnostic metadata. That can make closed local transport appear closer to active authorization than it is.

## Risks / Trade-offs

- Expected close classification could drift as more close paths are added -> Mitigation: keep the suppression flag scoped to managed stop/leave and add integration coverage.
- Local socket close may race with trusted remote host disconnect -> Mitigation: do not overwrite `remotePeerDisconnected` status or its `remoteDisconnectReasonCode`.
- Status output grows another local cause value -> Mitigation: values remain a bounded union and formatting already handles optional local cause metadata.
