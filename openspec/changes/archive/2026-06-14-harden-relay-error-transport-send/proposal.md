## Why

Relay message rejection is a security boundary: malformed or unauthorized input must be audited and rate-limited even when the sender's WebSocket is already closing. The current rejection path attempts to send `relay-error` unconditionally, so a transport race can turn a safe rejection into an unhandled send failure.

## What Changes

- Make peer-facing `relay-error` delivery best-effort and gated on an open WebSocket.
- Preserve mandatory audit and invalid-message rate-limit accounting before any optional peer-facing error response.
- Add integration coverage for a rejection path where the sender socket is closed during rejection handling.
- Preserve existing bounded relay-error contents, close reasons, forwarding denial, pairing, token, heartbeat, and authorization behavior.
- Non-goals: no capture, input, clipboard, file-transfer, diagnostics, installer, startup, service, credential, privilege, hidden-session, token, consent, or authorization semantic changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `relay-abuse-protection`: rejected-message audit/rate-limit handling must not depend on successful `relay-error` transport delivery.
- `relay-runtime`: runtime rejection tests must cover closed-socket relay-error send races.

## Impact

- Affected code: `apps/relay/src/server.ts` and relay integration tests.
- Affected systems: development relay rejection handling for malformed, stale, or unauthorized peer messages.
- Safety impact: strengthens fail-closed behavior for rejected relay messages and prevents transport state from suppressing audit/rate-limit accounting.
- Security review: required because this touches relay rejection, logs/audit, and abuse-control behavior.
