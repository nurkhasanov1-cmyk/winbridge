## Why

Relay runtime integration coverage should explicitly match the protocol rule that access-key and SSH-key material is sensitive remote-assistance data. The shared schema already rejects those keys; this change makes the relay contract and tests prove that the relay does not forward them or expose their values in audit metadata.

## What Changes

- Update relay-runtime requirements to include access-key and SSH-key signal payload rejection at the relay boundary.
- Add relay integration coverage for nested and array-contained access-key and SSH-key payload fields.
- Verify relay rejection responses and audit records remain bounded and do not include raw key values.
- Non-goals: no screen capture, input, clipboard, file transfer, native Windows APIs, installer, startup, service, persistence, or privilege-elevation behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `relay-runtime`: Extend unsafe signal rejection coverage to access-key and SSH-key payload fields.

## Impact

- Affected code: `apps/relay/src/server.integration.test.ts` and relay-runtime OpenSpec artifacts.
- Affected systems: development relay validation/audit verification only.
- Safety impact: strengthens proof that credential-like key material is rejected before forwarding and excluded from relay audit details.
