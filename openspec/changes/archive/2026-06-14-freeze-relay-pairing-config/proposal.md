## Why

Development pairing settings are a safety boundary for brokered relay sessions: hosts create expiring pairing tickets and viewers can only join by consuming valid pairing material. The relay already rejects malformed environment and injected pairing settings before accepting peers, but the normalized config object is mutable after validation.

Making the validated pairing configuration an immutable snapshot prevents test or embedding code from accidentally treating post-validation mutations as supported relay behavior. This matches the heartbeat configuration boundary and keeps pairing TTL/use semantics tied to values that passed validation.

## What Changes

- Return an immutable validated pairing config snapshot from `normalizeRelayPairingConfig()`.
- Preserve caller-mutable clock injection through the copied `now` function reference without exposing mutable TTL or maximum-use fields.
- Add focused tests proving normalized pairing settings are immutable and that mutating the original caller object after `RoomRegistry` construction does not change pairing ticket behavior.
- Preserve existing defaults, environment parsing, safe TTL/use bounds, and two-party pairing behavior.
- Non-goals: no production identity, reconnect policy, capture, input, clipboard, file-transfer, diagnostics, installer, startup, service, token, privilege, or authorization semantic changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `relay-runtime`: development pairing ticket configuration is represented as a validated immutable snapshot before use by the relay runtime or room registry.

## Impact

- Affected code: `apps/relay/src/rooms.ts` and relay room/runtime tests.
- Affected systems: development relay pairing ticket configuration for programmatic callers and tests.
- Safety impact: keeps pairing ticket TTL and maximum-use behavior bound to validated values and avoids ambiguous post-validation config mutation.
- Security review: required because this touches relay pairing behavior.
