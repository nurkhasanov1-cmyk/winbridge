## Why

Protocol envelopes become trusted relay and agent inputs after shared schema validation. If the parsed envelope object or nested payload arrays/objects remain mutable, a future caller can accidentally alter sender identity, permission scope, authorization state, signal payload, or audit details after validation but before forwarding or workflow processing.

## What Changes

- Return immutable snapshots from `parseProtocolEnvelope` and `decodeProtocolEnvelope`.
- Freeze nested parsed protocol data such as permission arrays, capabilities, signal payloads, and audit detail objects.
- Preserve existing schema validation, redaction, canonical JSON encoding, and wire format behavior.
- Add regression tests proving parsed envelopes cannot be mutated after validation.
- Non-goal: add no new remote action permission, protocol message type, relay routing behavior, capture, input, clipboard, file transfer, diagnostics, installer, startup, service, token, logging sink, or privilege-elevation capability.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-broker`: trusted parsed protocol envelopes become immutable after validation.

## Impact

- Affected code: `packages/protocol/src/messages.ts` and `packages/protocol/src/messages.test.ts`.
- Consumers still receive the same plain JSON-compatible data shape, but post-parse mutation fails instead of silently changing trusted message state.
- No dependency, transport, protocol wire-shape, installer, service, native Windows API, capture, input, persistence, or privilege changes.
