## Why

`signal` payload validation blocks several obvious remote-assistance secrets, but it does not yet cover common auth/session key names that the audit redaction layer already treats as sensitive. Aligning these boundaries reduces the chance that relay-forwarded signaling metadata carries raw API keys, authorization headers, cookies, or private keys.

## What Changes

- Expand protocol validation for `signal` payload keys to reject common authentication/session secret indicators.
- Preserve non-secret lifecycle identifiers such as `authorizationId` so safe protocol correlation metadata remains usable.
- Add protocol and relay integration tests proving the expanded rejection happens before forwarding and audit output remains secret-safe.
- Update security documentation for the expanded `signal` payload boundary.
- No new remote-control, capture, input, installer, service, startup, persistence, or privilege-elevation capability is introduced.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-broker`: Expand `signal` payload safety requirements for sensitive key-name rejection.
- `relay-runtime`: Expand relay verification expectations for unsafe `signal` rejection and secret-safe audit metadata.

## Impact

- Affected code: `packages/protocol/src/messages.ts`, `packages/protocol/src/messages.test.ts`, `apps/relay/src/server.integration.test.ts`.
- Affected docs/specs: `docs/security-model.md`, `openspec/specs/session-broker/spec.md`, `openspec/specs/relay-runtime/spec.md`.
- Safety impact: reduces accidental forwarding or persistence of secrets in signaling metadata; does not weaken explicit host consent, visibility, revoke/disconnect, or audit requirements.
- Touches: relay, token-adjacent validation, audit/log safety expectations.
- Does not touch: native capture, input injection, installer behavior, startup behavior, services, credential access, Windows prompt behavior, or privilege elevation.
