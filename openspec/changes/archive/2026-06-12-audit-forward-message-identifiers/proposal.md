## Why

Accepted relay-forward audit records identify sender, recipient, and message type, but they do not include the protocol message id. Recording the bounded protocol `messageId` improves traceability for consent and incident review without storing raw payloads or user-provided display metadata.

## What Changes

- Add the parsed protocol `messageId` to accepted `relay.message.forwarded` audit detail.
- Preserve existing recipient routing metadata for accepted forwarded messages.
- Preserve existing `authorizationId` detail for accepted forwarded `signal` messages without copying any other signal payload keys.
- Add integration coverage proving accepted forward audit detail includes `messageId` for signal and non-signal messages while excluding raw payload/display metadata.
- Do not add relay-side production authorization, native screen capture, input injection, clipboard sync, file transfer, diagnostics capture, reconnect, installer behavior, services, startup persistence, privilege elevation, AV/EDR evasion, or Windows prompt bypass.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `relay-runtime`: accepted forward audit metadata includes the bounded protocol message identifier while remaining payload-safe.

## Impact

- Affected code: `apps/relay/src/server.ts` and `apps/relay/src/server.integration.test.ts`.
- Affected specs/docs: relay runtime audit behavior and operator-facing security/architecture docs if they need to name forwarded message identifiers.
- Security impact: touches relay audit metadata. It improves traceability while preserving consent, visibility, revocation, and payload-redaction boundaries.
