## Why

The development relay forwards `session-authorization-request` only from the registered viewer, but the non-native agent shell can be connected to arbitrary WebSocket endpoints in tests and CLI use. A host runtime currently accepts any same-session, non-self authorization request before it has bound the request to an observed opposite-role viewer peer. That can make the host emit local `received` events, decisions, states, and audit events for an unknown viewer identity.

## What Changes

- Track the accepted opposite-role peer id observed through inbound `hello`.
- Ignore host-side `session-authorization-request` messages whose `viewerPeerId` does not match the observed opposite-role viewer peer before local `received` events and host authorization workflow handling.
- Keep ignored-message diagnostics generic and secret-safe.
- Preserve normal host-viewer relay behavior where the viewer `hello` arrives before the authorization request.
- Update `agent-shell-consent-workflow` with a host authorization request peer-binding requirement.
- Non-goals: do not change relay forwarding rules, protocol schemas, authorization decisions, capture, input, clipboard, file transfer, WebRTC, native Windows UI, services, startup persistence, credential access, stealth behavior, or production authentication.

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-shell-consent-workflow`: add local observed-peer binding before host authorization request workflow handling.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts` and focused runtime integration tests.
- Affected docs/specs: `agent-shell-consent-workflow`.
- Security impact: touches host authorization workflow and diagnostics; requires security review.
- External API impact: host runtimes ignore same-session authorization requests until an accepted opposite-role viewer `hello` has established the viewer peer id.
- Dependencies: no new runtime dependencies.
