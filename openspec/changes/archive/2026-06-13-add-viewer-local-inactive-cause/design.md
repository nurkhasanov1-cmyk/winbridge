## Context

The agent shell currently exposes read-only viewer status for local development diagnostics. It can show active authorization metadata and a relay-defined remote host disconnect reason code after trusted host disconnect. Explicit viewer leave clears connection-scoped authorization, so a later status read is correctly inactive but does not explain that the inactive state came from the viewer's own local leave.

## Goals / Non-Goals

**Goals:**

- Preserve a bounded local `localInactiveCause` value after explicit viewer leave.
- Print that value in one-shot viewer status and viewer control prompt status output.
- Keep local leave separate from trusted remote disconnect metadata and clear it on the next runtime start.

**Non-Goals:**

- Do not add or change protocol messages, relay routing, close reasons, audit payloads, reconnect behavior, capture, input, clipboard, file transfer, installer behavior, service behavior, token handling, or privilege elevation.
- Do not preserve authorization id/status after viewer leave; leave remains connection-scope clearing.
- Do not expose peer ids, display names, private reasons, raw protocol payloads, raw close reasons, or other sensitive metadata.

## Decisions

- Store the cause in local session state as a small enum-like value, initially `local-leave`.
  Alternative: derive it from socket close state. That would conflate explicit viewer leave with cleanup `stop()` and ordinary socket close.
- Set the cause after `leave()` completes the existing stop path.
  Alternative: set it before stopping. The existing stop path resets connection-scoped state, so setting after stop preserves the explicit local-leave marker without preserving old authorization metadata.
- Clear the cause through the existing connection-scope reset on `start()` and ordinary `stop()`.
  Alternative: persist it until process exit. That would make a fresh session show stale local metadata.

## Risks / Trade-offs

- Local metadata could be mistaken for a remote disconnect reason -> Mitigation: use a separate `localInactiveCause` field and keep `remoteDisconnectReasonCode` only for trusted relay-originated host disconnect.
- Status output grows another field -> Mitigation: output remains bounded, optional, and metadata-only.
- Accidental side effects from status reads -> Mitigation: keep implementation in snapshot/formatting paths and verify sent-event counts around status reads.
