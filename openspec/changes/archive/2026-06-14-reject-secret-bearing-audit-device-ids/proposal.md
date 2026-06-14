## Why

Participant audit actor `deviceId` values are currently schema-validated as protocol identifiers, but the shared audit schema does not reject identifier-shaped values that contain token, credential, cookie, key, or authorization marker families. That leaves a small gap where a component can accidentally store secret-bearing metadata in actor attribution instead of bounded detail redaction.

## What Changes

- Reject host/viewer audit actor `deviceId` values that contain secret-bearing protocol identifier metadata.
- Preserve existing acceptance for safe host/viewer `deviceId` values.
- Preserve existing rejection of `deviceId` on `system` and `relay` audit actors.
- Add tests proving rejection errors stay bounded and do not echo raw secret-bearing device ids.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `audit-foundation`: Tighten audit actor device attribution so participant `deviceId` values are non-secret metadata before audit storage, local emission, console output, file persistence, or protocol encoding.

## Impact

- Affected code: `packages/protocol/src/audit.ts`, `packages/protocol/src/audit.test.ts`.
- Affected APIs: Shared audit record validation rejects additional malformed `actor.deviceId` inputs for participant actors.
- Safety impact: Reduces risk of storing raw token/credential/key/authorization markers in audit actor metadata. This does not grant permissions or add remote access behavior.
- Non-goals: No capture, input, clipboard, file transfer, diagnostics, relay routing, installer, startup, service, persistence, token transport, credential collection, privilege elevation, hidden sessions, or Windows prompt behavior changes.
