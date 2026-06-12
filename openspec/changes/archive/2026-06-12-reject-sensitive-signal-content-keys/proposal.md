## Why

`signal` messages are intended for bounded signaling metadata, not for transporting remote-assistance content. Clipboard values, file-transfer bytes, and diagnostics dumps are sensitive actions in the WinBridge safety model, so their obvious payload key names must be rejected before the relay can forward them.

## What Changes

- Expand `signal` payload-key validation to reject clipboard, file-transfer content/data/bytes, and diagnostics content/dump keys at any nesting level.
- Keep non-secret lifecycle identifiers such as `authorizationId` accepted.
- Add protocol and relay verification proving the new keys are rejected before forwarding and without leaking raw content into audit records.
- Update security and architecture documentation to name the expanded `signal` payload boundary.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-broker`: Expand the `signal` payload safety requirement to include clipboard, file-transfer, and diagnostics content key indicators.
- `relay-runtime`: Expand runtime rejection verification for unsafe `signal` payloads and secret-safe rejection audit metadata.

## Impact

- Affected code: `packages/protocol/src/messages.ts`, focused protocol tests, and relay integration tests.
- Affected docs/specs: OpenSpec `session-broker` and `relay-runtime`, security model, and architecture documentation.
- Safety impact: this tightens the development relay boundary and does not add capture, input, clipboard sync, file transfer, diagnostics export, installer, startup, service, token storage, or privilege elevation behavior.
