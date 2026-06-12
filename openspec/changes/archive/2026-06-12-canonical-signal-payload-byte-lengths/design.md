## Context

Signal payloads are already validated through the shared JSON-compatible object schema before they are trusted, forwarded, encoded, or exposed as redacted runtime event metadata. Two byte-length calculations still call `JSON.stringify` directly:

- protocol validation measures `signal.payload` before enforcing the 16 KiB size bound
- agent-shell redaction measures `signal.payload` for local sent/received event metadata

Because the payloads are canonicalized before these paths, the current behavior is not expected to expose raw signal contents. This change removes a remaining inconsistency by using the same canonical JSON encoder for every signal payload byte-length calculation.

## Goals / Non-Goals

**Goals:**

- Use the shared `stringifyJson` encoder for protocol signal payload size enforcement.
- Use the shared `stringifyJson` encoder for redacted agent-shell signal event byte lengths.
- Add regression coverage for inherited `toJSON` hooks affecting neither size enforcement nor local event metadata.
- Preserve the current payload size bound, redacted event shape, consent gates, authorization binding, and wire contract.

**Non-Goals:**

- No change to protocol message schemas, relay routing, session authorization state, or payload redaction shape.
- No new screen capture, input, clipboard, file transfer, diagnostics, reconnect, installer, startup, service, token, privilege, or native Windows behavior.
- No relaxation of signal payload JSON compatibility or sensitive-key rejection.

## Decisions

### Reuse the shared canonical JSON encoder for byte length

`packages/protocol/src/messages.ts` will measure signal payload bytes with `Buffer.byteLength(stringifyJson(payload), "utf8")`. `apps/agent-shell/src/runtime.ts` will do the same when redacting signal events.

Rationale: `stringifyJson` is the shared encoder hardened against inherited `toJSON` hooks and unsupported JSON shapes. Reusing it prevents direct `JSON.stringify` behavior from drifting across validation and diagnostics.

Alternative considered: keep direct `JSON.stringify` because payloads are already canonicalized. That is technically low risk, but it leaves two security-adjacent paths using a different serialization primitive than the rest of the protocol and audit boundaries.

### Keep event metadata redacted

The agent-shell event payload remains `{ redacted: "[REDACTED]", byteLength }`. Only the byte-length calculation changes.

Rationale: byte length is useful local diagnostic metadata, but raw signal contents remain prohibited in events and logs.

Alternative considered: remove byteLength from events. That would reduce metadata, but existing specs and tests allow this secret-safe diagnostic field and it is useful when debugging malformed or oversized payloads.

### Test at protocol and agent-shell levels

Protocol tests will prove size enforcement uses canonical JSON bytes under inherited `toJSON`. Agent-shell tests will prove local sent/received signal event byte lengths match canonical JSON bytes and do not expose injected content.

Rationale: protocol validation and runtime event redaction are separate boundaries and both should have targeted coverage.

## Risks / Trade-offs

- Byte lengths for valid payloads must remain stable -> use the same JSON representation already used for protocol encoding.
- Prototype mutation in tests could leak across cases -> restore descriptors in `finally` and assert after restoration.
- This touches auth-adjacent signal handling and local diagnostics -> require focused security review.

## Migration Plan

No migration is required. Valid signals keep the same wire shape and local events keep the same redacted shape. Rollback is limited to the two byte-length call sites if a compatibility issue is found.

## Open Questions

None.
