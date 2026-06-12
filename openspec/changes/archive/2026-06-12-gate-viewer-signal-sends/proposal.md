## Why

The agent shell already validates consent workflow messages, but its public runtime send path can still be used by a viewer to emit `signal` messages without first observing an active visible authorization state. Adding a fail-closed viewer signal gate gives future remote-assistance transports a safer default before native capture, input, or WebRTC work exists.

## What Changes

- Track the viewer's latest inbound authorization lifecycle state from host-originated workflow messages.
- Block viewer-originated `signal` sends until the viewer has an active, visible, unexpired `screen:view` authorization state.
- Immediately fail closed after pause, termination, expiration, or revocation removes `screen:view`.
- Ensure blocked sends emit no local `sent` event and do not expose raw signal payloads, tokens, pairing codes, private reasons, screen contents, or input contents in diagnostics.
- Update docs and specs to describe the local viewer signal authorization gate.
- Non-goals: do not implement screen capture, remote input, clipboard sync, file transfer, WebRTC media, native Windows UI, services, startup persistence, or production authentication.

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-shell-consent-workflow`: add viewer-side authorization gating for runtime `signal` sends.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts` and focused runtime integration tests.
- Affected docs/specs: agent shell architecture/security docs and `agent-shell-consent-workflow`.
- Security impact: touches authorization and local send-path logging; requires explicit security review.
- External API impact: low-level `AgentShellRuntime.send()` remains available, but viewer `signal` messages now fail closed until active visible `screen:view` authorization is observed.
- Dependencies: no new runtime dependencies.
