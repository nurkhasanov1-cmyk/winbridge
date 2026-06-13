## Why

The viewer signal probe now exercises one-way consent-bound signaling, but the bootstrap still lacks a safe CLI-level round-trip check. A host-side static probe acknowledgement verifies bidirectional signaling before WebRTC media work while preserving all consent, visibility, authorization, and redaction gates.

## What Changes

- Add an opt-in host CLI flag for acknowledging viewer signal probes.
- When enabled, the host responds to one trusted viewer probe per authorization id with a static acknowledgement `signal` payload.
- Route acknowledgements through the existing managed runtime public `send()` path so signal authorization, routing, payload validation, redacted events, local disconnect, remote disconnect, pause, revoke, termination, and expiration gates remain authoritative.
- Reject malformed, viewer-mode, or ambiguous host acknowledgement configuration before runtime startup.
- Keep acknowledgement payloads static and bounded with no SDP, ICE candidates, user-provided JSON, tokens, pairing codes, display names, screen contents, input, clipboard data, file-transfer data, or diagnostics data.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: add an opt-in host acknowledgement for trusted viewer signal probes.

## Impact

- Affected specs: `agent-shell-consent-workflow`
- Affected code: `apps/agent-shell/src/args.ts`, `apps/agent-shell/src/runtime.ts`, agent-shell tests.
- Affected docs: `README.md`, `docs/architecture.md`, `docs/security-model.md`
- Security touchpoints: signaling behavior and authorization gates only. This change does not touch capture, input, relay authorization, installer behavior, startup persistence, services, tokens, logs beyond existing secret-safe signal/audit paths, or privilege elevation.
