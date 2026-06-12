## Why

Accepted relay-forward audit records identify the sender through the audit actor and record the message type, but they do not identify the safe recipient route. Recording bounded recipient metadata makes consent and incident review more traceable without storing raw protocol payloads or user display data.

## What Changes

- Add `recipientPeerId` and `recipientRole` to accepted `relay.message.forwarded` audit detail after the relay has selected the single registered recipient.
- Preserve existing `messageType` audit detail for all forwarded messages and existing `authorizationId` detail for forwarded `signal` messages.
- Add integration coverage proving accepted signal and non-signal forward audit detail includes recipient metadata and remains payload-safe.
- Do not log raw payloads, display names, reasons, SDP, ICE candidates, tokens, pairing codes, credentials, screenshots, keystrokes, clipboard data, file-transfer data, diagnostics, or full secrets.
- Do not add relay-side production authorization, native screen capture, input injection, clipboard sync, file transfer, diagnostics capture, reconnect, installer behavior, services, startup persistence, privilege elevation, AV/EDR evasion, or Windows prompt bypass.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `relay-runtime`: accepted forward audit metadata includes secret-safe recipient routing metadata while preserving payload-safe audit boundaries.

## Impact

- Affected code: `apps/relay/src/server.ts` and `apps/relay/src/server.integration.test.ts`.
- Affected specs/docs: relay runtime audit behavior and operator-facing security/architecture docs if needed.
- Security impact: touches relay audit logs and routing metadata. It improves traceability while keeping host consent, visible-session, revocation, and payload-redaction boundaries unchanged.
