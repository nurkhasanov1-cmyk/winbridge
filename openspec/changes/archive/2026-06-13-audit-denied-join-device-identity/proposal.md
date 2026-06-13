## Why

Denied relay joins are useful for troubleshooting pairing and duplicate-role failures, but current denial audit metadata does not attribute valid joining device identity. Adding bounded attribution helps investigations while avoiding raw display names, pairing codes, and protocol payloads.

## What Changes

- Add bounded device identity attribution to `relay.peer.join.denied` detail when the denied message is a schema-valid `join-session` with schema-valid `deviceIdentity`.
- Include only non-secret metadata: `platform`, `trustLevel`, `createdAt`, and `deviceId` when that `deviceId` does not contain the submitted pairing code.
- Redact attempted `deviceId` with bounded length metadata when it contains the submitted pairing code.
- Continue omitting raw display names, raw pairing codes, tokens, credentials, protocol payloads, remote-content data, permissions, and authorization identifiers.
- Keep denied identity metadata audit-only and non-authorizing.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `relay-runtime`: denied peer join audit records include bounded device identity attribution for valid join attempts without leaking pairing credentials or changing consent/auth behavior.

## Impact

- Touches relay and logs/audit behavior.
- Affected code: `apps/relay/src/server.ts` and relay integration tests.
- No capture, input, installer, startup, service, token, privilege elevation, or native Windows API changes.
- No wire protocol breaking change and no new dependency.
