## Why

Secret-bearing protocol identifier detection now exists in more than one protocol module. That creates drift risk for audit-event, audit record, authorization, and consent-bound grant validation even though they protect the same metadata class.

## What Changes

- Add one shared protocol helper for secret-bearing identifier metadata classification.
- Route audit fixed identifiers, audit-event fixed identifiers, authorization identifiers, authorization detail redaction, and consent-bound grant identifiers through the same helper.
- Preserve existing public exports and validation behavior for safe and unsafe identifiers.
- Add regression coverage that proves the helper is shared and the protected marker families remain aligned.
- Do not add remote access capabilities, permission vocabulary, relay behavior, capture, input, installer, startup, service, token handling, log sinks, or privilege elevation.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `protocol-identifiers`: require protocol-facing secret-bearing identifier metadata checks to use one shared classifier so security-sensitive validation paths stay aligned.

## Impact

- Affected code: `packages/protocol/src`.
- Affected specs: `openspec/specs/protocol-identifiers/spec.md`.
- API impact: existing named exports remain available; no breaking changes intended.
- Safety impact: no new remote capability. The change keeps existing fail-closed identifier rejection and redaction behavior consistent across audit, protocol messages, authorization, and session grant validation.
- Touched areas: auth and logs via shared protocol validation helpers. Does not touch capture, input, relay routing/runtime, installer, startup, services, tokens, or privilege elevation.
