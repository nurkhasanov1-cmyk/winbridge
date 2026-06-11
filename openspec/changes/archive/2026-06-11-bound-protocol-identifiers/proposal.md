## Why

Protocol identifiers are accepted by protocol schemas, authorization records, relay rooms, and audit metadata. Several identifiers currently have minimum lengths but no shared upper bounds or character profile, which allows oversized or control-character-bearing IDs to reach relay state and logs before later product layers exist.

## What Changes

- Add shared protocol identifier requirements for bounded, printable session, peer, message, authorization, audit, pairing, and device identifiers.
- Reject malformed identifiers at schema parsing before relay registration, authorization state transitions, forwarding, or audit use.
- Preserve existing valid development identifiers such as `session-demo`, `host-1`, `viewer-1`, generated UUID message IDs, `authz_*`, `audit_*`, and `pair_*`.
- Keep relay rejection metadata bounded and secret-safe when malformed identifiers are rejected.
- Non-goals: no screen capture, input injection, native Windows UI, installer, startup service, unattended access, credential access, or production identity provider behavior.

## Capabilities

### New Capabilities
- `protocol-identifiers`: Shared constraints for identifiers carried by protocol envelopes, authorization records, pairing records, and audit-related protocol messages.

### Modified Capabilities

## Impact

- Affected code: `packages/protocol/src/session.ts`, `packages/protocol/src/messages.ts`, `packages/protocol/src/identity.ts`, `packages/protocol/src/authorization.ts`, related tests, and relay integration coverage for malformed joins.
- Affected systems: development relay join/message validation, non-native agent shell protocol parsing, authorization state schemas, and audit-related protocol metadata.
- Safety impact: touches authorization, relay, and log metadata validation; requires security review. Does not add remote capabilities or relax consent, visibility, revocation, or audit requirements.
