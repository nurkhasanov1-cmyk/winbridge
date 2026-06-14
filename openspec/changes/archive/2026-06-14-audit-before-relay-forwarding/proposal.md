## Why

Accepted relay forwarding is a security-relevant side effect. Today the relay sends a validated peer message to the recipient before writing the accepted `relay.message.forwarded` audit record, which means an audit sink failure can leave a forwarded message without durable accepted-forward evidence.

## What Changes

- Write the accepted `relay.message.forwarded` audit record before forwarding the peer message to the remaining registered peer.
- If accepted-forward audit writing fails, fail closed before recipient delivery and surface only bounded peer-facing rejection diagnostics where possible.
- Add relay integration coverage proving audit failure blocks forwarding and does not leak raw protocol payload, private reason text, tokens, pairing codes, or remote-content markers.
- Preserve existing room membership, pairing, token validation, relay-error bounds, invalid-message audit/rate-limit handling, authorization schema validation, and successful forwarding output.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `relay-runtime`: Accepted peer message forwarding must commit the accepted-forward audit record before recipient delivery, and accepted-forward audit failure must block forwarding.

## Impact

- Affected code: `apps/relay/src/server.ts` and relay integration tests.
- Affected specs/docs: `openspec/specs/relay-runtime/spec.md`; security model documentation if implementation changes documented relay audit ordering.
- Affected systems: development relay accepted forwarding and relay audit behavior.
- Safety impact: strengthens auditability for accepted relay forwarding. This does not add capture, input, clipboard, file-transfer, diagnostics, installer, startup, service, token issuance, privilege elevation, hidden-session, credential, keylogging, evasion, or Windows prompt bypass behavior.
- Review: security review is required because this touches relay routing and logging/audit behavior.
