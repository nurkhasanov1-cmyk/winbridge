## Why

Pairing is a two-party prerequisite relationship between a host device and a viewer device. Allowing a paired-device record where `hostDeviceId` and `viewerDeviceId` are identical makes pairing metadata ambiguous and can mask integration mistakes before production identity exists.

## What Changes

- Reject paired-device records whose viewer device id equals the host device id from the source pairing ticket.
- Keep successful pairing non-authorizing: the record remains identity metadata only and grants no screen, input, clipboard, file, diagnostics, reconnect, hidden-session, or consent-bypass capability.
- Preserve existing pairing ticket creation, salted hash verification, replay resistance, expiration, and relay forwarding behavior.
- Redact attempted viewer device ids from relay denied-join audit details when the denial is caused by self-pairing.
- Safety impact: this is fail-closed identity-boundary hardening. It does not add capture, input, clipboard, file transfer, diagnostics, relay routing behavior, installer behavior, startup persistence, services, tokens, privilege elevation, or any remote action.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `identity-pairing`: require paired-device records to bind distinct host and viewer device ids.
- `relay-runtime`: redact attempted device ids in denied-join audit details for self-pairing denials.

## Impact

- `packages/protocol/src/identity.ts`: reject self-pairing before returning a paired-device record.
- `packages/protocol/src/identity.test.ts`: add focused rejection coverage and preserve valid distinct-device pairing.
- `apps/relay/src/server.ts`: preserve a bounded self-pairing denial reason and redact the attempted device id in denied-join audit details.
- `apps/relay/src/server.integration.test.ts`: add denied-join audit coverage for self-pairing redaction.
- `docs/security-model.md` and `docs/architecture.md`: document that pairing records must represent distinct host and viewer devices.
- OpenSpec `identity-pairing`: add the distinct-device pairing requirement.
- OpenSpec `relay-runtime`: add the self-pairing denied-join audit redaction scenario.
