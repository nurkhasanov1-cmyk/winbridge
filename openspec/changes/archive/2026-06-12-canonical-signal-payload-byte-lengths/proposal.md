## Why

Signal payload size checks and redacted signal event metadata still contain local direct `JSON.stringify` byte-length calculations. The payloads are already canonicalized, but using the shared canonical JSON encoder for all signal payload byte lengths removes drift and keeps prototype-pollution hardening consistent across protocol and agent-shell boundaries.

## What Changes

- Measure protocol `signal.payload` size with the shared canonical JSON encoder before enforcing the 16 KiB payload bound.
- Measure agent-shell redacted sent/received `signal` event `byteLength` with the same canonical encoder.
- Add regression coverage proving inherited `toJSON` hooks cannot alter signal payload size enforcement or redacted event byte-length metadata.
- Keep the existing `signal` wire shape, redacted event shape, payload size bound, consent gates, authorization binding, and relay forwarding behavior unchanged.
- Non-goals: no screen capture, input injection, clipboard, file transfer, diagnostics collection, native Windows API, installer, startup, service, token format, privilege elevation, hidden session, reconnect, or transport change.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-broker`: signal payload size enforcement must use canonical JSON byte length that inherited `toJSON` hooks cannot alter.
- `agent-shell-consent-workflow`: redacted signal sent/received event byte-length metadata must use the same canonical JSON byte length and remain secret-safe.

## Impact

- Affected code: `packages/protocol/src/messages.ts`, `apps/agent-shell/src/runtime.ts`, and focused protocol/agent-shell tests.
- Affected APIs: no public API or wire contract change; event `payload.byteLength` remains a number.
- Affected systems: protocol validation and local agent-shell runtime event metadata.
- Safety impact: strengthens signal payload validation and redacted diagnostics consistency without adding remote access capability. Touches auth-adjacent signal gating and local event/log metadata, so it requires security review.
