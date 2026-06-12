## Context

The protocol package is the canonical validator for `signal.payload`. Relay integration now proves access-key and SSH-key payload rejection at the relay boundary, but the non-native agent shell also has public-send and inbound parsing paths that should be explicitly covered because those paths decide whether local `sent` or `received` runtime events become trusted workflow input.

## Goals / Non-Goals

**Goals:**

- Prove public runtime `send()` rejects access-key and SSH-key signal payload fields before socket write and before local `sent` event emission.
- Prove inbound signal messages containing access-key or SSH-key fields are treated as unsafe raw input before local `received` event emission.
- Verify local events and logs do not expose raw key values from rejected payloads.

**Non-Goals:**

- No new signal payload parser or duplicated sensitive-key list in agent-shell.
- No changes to authorization grants, capture, input, clipboard, file transfer, diagnostics collection, native Windows APIs, installer, startup, service, persistence, or privilege behavior.

## Decisions

- Exercise the shared validator through existing agent-shell runtime paths.
  Public `send()` already normalizes outbound messages through `parseProtocolEnvelope`, and inbound handling validates decoded envelopes before trusted event emission. Tests should prove those paths inherit the shared access-key and SSH-key rejection behavior.

- Keep rejected payload diagnostics metadata-only.
  Assertions should check for no local sent/received signal event and no raw key material in local event/log serialization. They should not depend on internal Zod paths or field names.

## Risks / Trade-offs

- Table-driven integration tests add runtime cost.
  Mitigation: use a small set of representative field shapes and reuse existing helpers.

- Test-only change could miss future implementation drift if validation is bypassed.
  Mitigation: tests drive public `send()` and a direct inbound WebSocket message, covering the behavior paths rather than just unit-level schema parsing.
