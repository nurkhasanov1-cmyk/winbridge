## Why

The relay currently sends `error.message` back to peers and stores it as the audit reason for many rejection paths. Those messages are produced by parsers and validators, so they can become verbose implementation detail and are a poor public error contract.

## What Changes

- Normalize relay rejection reasons into a bounded allow-list before sending `relay-error` responses or writing audit reasons.
- Preserve existing specific safe reasons for known relay policy failures such as pairing failures, forged disconnect notices, unsafe signal payloads, oversized messages, and session mismatch.
- Map parser and schema-validation failures to a generic safe reason without raw validation details.
- Add relay integration tests proving malformed protocol input returns a bounded reason and audit does not include raw message contents.
- Safety impact: reduces information disclosure and accidental sensitive detail exposure through relay error and audit surfaces.
- Non-goals: no capture, input, clipboard, file transfer, installer, startup, services, privilege elevation, production identity, or transport encryption work.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-broker`: clarify that malformed protocol rejection errors are bounded and secret-safe.
- `relay-abuse-protection`: require invalid message audit reasons and peer-facing relay errors to avoid raw parser details and raw protocol payloads.
- `relay-runtime`: add integration-test coverage for bounded malformed-message rejection reasons.

## Impact

- Affected code: `apps/relay/src/server.ts` and relay integration tests.
- APIs: malformed messages receive bounded relay error reasons rather than raw parser or validator messages.
- Dependencies: none.
- Touched areas: relay error handling and audit metadata. Does not touch capture, input, authentication, installer behavior, startup behavior, services, token storage, or privilege elevation.
