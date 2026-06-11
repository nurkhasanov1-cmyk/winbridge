## Why

The authorization state machine rejects empty, duplicate, and unsafe permission scopes, but the protocol message schemas can still accept malformed authorization payloads before they reach state-machine code. Hardening the wire contract makes malformed consent and state messages fail earlier and keeps peer implementations aligned with the consent-first model.

## What Changes

- Reject duplicate requested permissions in `session-authorization-request`.
- Reject approved authorization decisions with empty, duplicate, or missing grant scope; keep denied decisions grantless with a reason.
- Reject active, paused, and approved authorization state updates without a unique non-empty permission scope.
- Reject revoked, terminated, and expired state updates that still carry permissions.
- Keep pending and denied state updates fail-closed with empty permissions.
- Non-goals: no new remote actions, capture, input, clipboard, file transfer, installer, startup, service, token, privilege elevation, or native Windows behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-authorization-protocol`: add fail-closed permission-scope invariants to authorization request, decision, and state update messages.

## Impact

- Affected code: `packages/protocol/src/messages.ts`, `packages/protocol/src/messages.test.ts`.
- Affected specs: `openspec/specs/session-authorization-protocol/spec.md` through this delta.
- Safety impact: rejects malformed consent/state messages before they can be forwarded or acted on by peers.
