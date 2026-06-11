## Why

After a peer joins a relay room, the relay currently validates the session id before forwarding peer messages, but it does not consistently bind message actor fields to the registered socket identity. A registered peer must not be able to forward join-only, relay-originated, or spoofed actor/sender messages to the other peer.

## What Changes

- Add relay-side registered-peer authority checks before forwarding peer messages.
- Reject post-registration `join-session` messages so pairing credentials are not forwarded as ordinary peer data.
- Reject peer-originated relay-only messages such as `relay-ready` and keep the existing `peer-disconnected` rejection.
- Reject peer messages whose declared sender/actor peer id does not match the registered peer.
- Reject role-bound authorization messages when the registered peer role does not match the message role.
- Add relay integration tests for spoofed sender, post-registration join replay, relay-only message forgery, and role mismatch.
- No remote capture, input, installer, service, startup, persistence, credential collection, prompt bypass, or privilege capability is added.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-broker`: Add registered-peer message authority requirements for relay forwarding.
- `relay-runtime`: Add integration-test expectations for registered-peer authority rejection and secret-safe audit metadata.

## Impact

- Affected code: `apps/relay/src/server.ts`, `apps/relay/src/server.integration.test.ts`.
- Affected docs/specs: `docs/security-model.md`, `docs/architecture.md`, `openspec/specs/session-broker/spec.md`, `openspec/specs/relay-runtime/spec.md`.
- Safety impact: reduces identity spoofing and accidental pairing-code forwarding through the development relay; preserves host consent, visible-session, revoke/disconnect, auth/authz, and audit invariants.
- Touches: relay forwarding, authorization message routing, audit rejection reasons.
- Does not touch: native Windows capture/input, installer/startup/service behavior, credential access, AV/EDR behavior, Windows security prompts, or privilege elevation.
