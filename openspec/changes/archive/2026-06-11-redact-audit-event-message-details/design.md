## Context

Audit sink writes call `createAuditRecord`, which redacts sensitive detail fields before storage or console output. Protocol `audit-event` messages use a separate schema path and currently accept `detail` unchanged, so a future sender could accidentally put obvious secret-bearing fields on the wire even though sink persistence is safe.

## Goals / Non-Goals

**Goals:**

- Apply the existing audit detail redaction rules to protocol `audit-event` message details.
- Ensure both parsing inbound audit-event messages and encoding outbound audit-event messages produce redacted details.
- Keep audit-event metadata useful by redacting values under sensitive keys instead of dropping the whole detail object.

**Non-Goals:**

- No encryption, transport auth, durable audit storage, account identity, or production audit pipeline changes.
- No changes to screen capture, input, clipboard, file transfer, installer, service, startup, or privilege behavior.
- No attempt to detect secrets by value; this remains key-based bootstrap redaction.

## Decisions

- Reuse `redactAuditDetail` from `packages/protocol/src/audit.ts` inside the `AuditEventMessageSchema` detail field. This keeps sink and wire redaction behavior consistent and avoids duplicating sensitive-key rules.
- Implement redaction as a schema transform, not a caller-side helper. `parseProtocolEnvelope` and `encodeProtocolEnvelope` already centralize validation; a transform makes the safe behavior automatic for all current callers.
- Keep `detail` optional with a default empty object. Existing messages without details stay valid.

## Risks / Trade-offs

- Key-based redaction cannot catch secrets under innocuous field names. Mitigation: existing specs still require senders to construct secret-safe metadata and tests cover known sensitive field names.
- Redaction mutates parsed output for audit-event messages. Mitigation: this is the intended safety behavior and is limited to detail values under sensitive keys.
- Protocol transforms can hide sender mistakes. Mitigation: audit-event tests explicitly assert redaction so the behavior is visible and stable.
