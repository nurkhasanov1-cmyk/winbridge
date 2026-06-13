## Why

Accepted relay forward audit records already include safe routing metadata and signal authorization ids, but forwarded authorization lifecycle messages are not correlated by `authorizationId`. Adding that non-secret identifier improves auditability for consent, grant, revoke, pause, resume, terminate, and expiration workflows without logging raw reasons or grant payloads.

## What Changes

- Include `authorizationId` in accepted `relay.message.forwarded` audit detail for authorization lifecycle messages that carry one.
- Keep accepted forward audit detail payload-safe: do not include raw protocol payloads, private reasons, granted permissions, revoked permissions, audit-event detail fields, display names, tokens, pairing codes, signal payloads, or remote content.
- Add relay integration coverage for forwarded authorization lifecycle audit metadata.
- Non-goals: no relay authorization policy changes, no new remote-action permissions, no capture, input, installer, startup, service, token, privilege, or persistence behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `relay-runtime`: accepted relay forward audit records include safe authorization lifecycle identifiers.

## Impact

- Affected code: `apps/relay/src/server.ts`.
- Affected tests: `apps/relay/src/server.integration.test.ts`.
- Affected OpenSpec: `openspec/specs/relay-runtime/spec.md`.
- Safety impact: improves relay audit traceability for authorization lifecycle messages without expanding forwarding permissions or exposing sensitive protocol details.
