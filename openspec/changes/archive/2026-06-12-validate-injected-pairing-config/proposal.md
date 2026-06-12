## Why

The relay already validates pairing ticket TTL and maximum-use environment variables before accepting peers. Direct runtime callers can also inject pairing settings through `createRelayRuntime({ pairing })` or `new RoomRegistry(config)`. Those injected values should fail fast when malformed instead of being treated as omitted or failing later during ticket creation.

## What Changes

- Reject malformed injected pairing ticket TTL values before creating host pairing tickets.
- Reject malformed injected pairing ticket maximum-use values before creating host pairing tickets.
- Preserve omitted defaults, valid `ticketTtlMs: 0`, and valid maximum-use values from 1 through 10.
- Add focused tests for `null`, non-number, non-finite, fractional, negative, and out-of-range injected pairing settings.
- Update docs/specs to clarify that both environment-derived and injected pairing settings are bounded.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `relay-runtime`: injected development pairing ticket settings are rejected when malformed before host pairing ticket creation.

## Impact

- Affected code: relay room pairing configuration normalization and focused tests.
- Affected docs/specs: relay architecture/security docs and OpenSpec relay-runtime spec.
- Affected systems: local development relay tests or programmatic callers that inject pairing settings.
- Safety impact: prevents ambiguous or malformed pairing lifecycle configuration from reaching session broker state. This does not add capture, input, clipboard sync, file transfer, diagnostics export, installer, startup, service, credential collection, or privilege behavior.
