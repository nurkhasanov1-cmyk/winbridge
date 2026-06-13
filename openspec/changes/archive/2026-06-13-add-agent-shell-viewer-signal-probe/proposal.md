## Why

The relay and protocol already support consent-bound `signal` messages, but the CLI has no safe way to exercise the first media-transport step without writing custom test code. A viewer-only development signal probe gives the project a bounded signaling path toward WebRTC work while keeping screen capture, input, clipboard, file transfer, diagnostics, and native Windows behavior out of scope.

## What Changes

- Add an opt-in viewer CLI flag to schedule a static development signal probe after the viewer observes active visible `screen:view` authorization.
- Add a managed runtime viewer probe option that sends only a static JSON-compatible payload with the current `authorizationId`.
- Reuse existing public runtime `send()` signal gates so missing authorization, invisible authorization, pause, revoke, termination, expiration, missing `screen:view`, stale authorization id, local disconnect, and remote disconnect fail closed.
- Reject malformed, host-mode, or unsafe probe timer configuration before runtime startup.
- Keep emitted events, logs, relay audit, and docs secret-safe; the probe must not contain SDP, ICE candidates, user-provided payloads, tokens, pairing codes, display names, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents, or diagnostics dumps.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: add a viewer-only development signal probe that is authorization-bound and probe-payload-only.

## Impact

- Affected specs: `agent-shell-consent-workflow`
- Affected code: `apps/agent-shell/src/args.ts`, `apps/agent-shell/src/runtime.ts`, agent-shell tests.
- Affected docs: `README.md`, `docs/architecture.md`, `docs/security-model.md`
- Security touchpoints: signaling behavior and authorization gates only. This change does not touch screen capture, input injection, relay authorization, installer behavior, startup persistence, services, tokens, logs beyond existing secret-safe signal/audit paths, or privilege elevation.
