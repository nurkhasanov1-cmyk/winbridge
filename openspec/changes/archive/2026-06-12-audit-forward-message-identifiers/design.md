## Context

Every protocol envelope carries a bounded `messageId`. The relay validates protocol envelopes before forwarding and emits an accepted forward audit record after selecting the recipient. Existing accepted forward audit metadata includes message type, recipient route, and signal authorization id, but not the protocol message id.

## Goals / Non-Goals

**Goals:**

- Include the parsed protocol `messageId` in accepted forward audit detail.
- Keep accepted forward audit detail limited to schema-validated routing/lifecycle metadata.
- Ensure tests prove raw signal payloads, display names, permissions, and private content stay out of accepted forward audit detail.

**Non-Goals:**

- No relay-side active authorization state machine or production identity enforcement.
- No durable/distributed audit backend.
- No native Windows capture, input, clipboard, file transfer, diagnostics, reconnect, installer, service, startup, privilege, evasion, or Windows prompt behavior.

## Decisions

- Derive `messageId` from the parsed protocol envelope.
  The relay has already decoded and schema-validated the message, so the field is bounded before audit persistence.

- Include `messageId` for all accepted forwarded protocol messages.
  This makes accepted forward audit records consistently traceable across signaling, consent requests, and future peer messages.

- Do not add `messageId` to malformed-message audit detail.
  Malformed input may not have a schema-valid id and must remain on the generic invalid-message path.

## Risks / Trade-offs

- Message ids increase correlation detail -> keep them bounded to protocol identifiers and avoid payload/display metadata.
- Message ids do not prove authorization -> runtime gates and future production authorization remain required.
