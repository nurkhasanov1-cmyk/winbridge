## Context

The development relay writes `relay.message.forwarded` audit records after it validates sender authority, finds the single remaining peer, verifies explicit targets, and forwards the message. Those records currently carry `messageType`, plus signal `authorizationId` when applicable, but omit the selected recipient.

## Goals / Non-Goals

**Goals:**

- Include safe recipient routing metadata in accepted forward audit records.
- Preserve the exact payload-safe signal audit surface: message type, authorization id, and recipient metadata only.
- Keep non-signal forward audit detail payload-safe and limited to routing metadata.

**Non-Goals:**

- No relay-side active authorization state machine or production identity enforcement.
- No durable/distributed audit backend.
- No native Windows capture, input, clipboard, file transfer, diagnostics, reconnect, installer, service, startup, privilege, evasion, or Windows prompt behavior.

## Decisions

- Build accepted forward audit detail after recipient selection.
  The relay already has the validated protocol envelope and the concrete registered recipient at that point, so the helper can derive metadata without trusting arbitrary client payload fields.

- Include only `recipientPeerId` and `recipientRole`.
  Peer ids and roles are bounded protocol/session metadata. Display names, reasons, message payloads, and capability lists remain excluded.

- Keep signal authorization metadata additive.
  `authorizationId` remains present for signal messages because it is already classified as non-secret lifecycle metadata; no other signal payload key is copied.

## Risks / Trade-offs

- Recipient metadata improves traceability but increases audit correlation detail -> keep it limited to bounded peer id and role.
- Relay still cannot prove the authorization id is active -> agent/runtime gates and future production auth remain required.
