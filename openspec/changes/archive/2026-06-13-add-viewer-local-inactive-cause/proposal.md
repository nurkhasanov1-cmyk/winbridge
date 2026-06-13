## Why

Viewer status already reports active authorization state and trusted remote host disconnect metadata, but it cannot distinguish an inactive status caused by the viewer's own explicit local leave. That makes the development CLI and viewer control prompt less useful when validating consent-first disconnect flows.

## What Changes

- Add bounded local viewer inactive cause metadata to viewer status snapshots after explicit viewer local leave.
- Print the local inactive cause in one-shot viewer status and interactive viewer control prompt status output.
- Preserve the existing no-side-effect status boundary: reading status does not send protocol messages, emit workflow audit events, reconnect peers, invoke host controls, or change authorization state.
- Keep the metadata local-only; it is not a protocol field, relay behavior, audit payload, close reason, reconnect signal, capture trigger, input trigger, or host-visible control.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-shell-consent-workflow`: Viewer local status includes a bounded local inactive cause after explicit viewer leave.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`, `apps/agent-shell/src/viewer-status.ts`, focused unit and integration tests.
- Affected docs/specs: viewer status and viewer leave requirements in `agent-shell-consent-workflow`, README/security model status text.
- Safety impact: touches user-visible workflow/status only. It does not touch capture, input, auth authority, relay routing, installer, startup, services, tokens, logs, or privilege elevation.
