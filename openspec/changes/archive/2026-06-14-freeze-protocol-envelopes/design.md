## Context

`parseProtocolEnvelope` is the shared validation boundary for relay and agent protocol messages. It validates message shape, permissions, authorization identifiers, signal payload safety, audit detail redaction, and reason text before callers treat envelopes as trusted data.

Recent hardening made authorization records and consent-bound grants immutable after validation. Protocol envelopes need the same runtime safety property because they carry authorization decisions, lifecycle controls, signal payload metadata, and audit events across relay and agent code.

## Goals / Non-Goals

**Goals:**

- Freeze every envelope returned by `parseProtocolEnvelope`.
- Freeze nested parsed envelope data, including arrays and JSON object payload/detail values.
- Keep canonical JSON encoding and schema validation behavior unchanged.
- Add focused tests for authorization messages, signal payloads, and audit event details.

**Non-Goals:**

- No new message types, permission vocabulary, relay routing, reconnect behavior, native Windows APIs, capture, input, clipboard, file transfer, diagnostics, installer, service, startup persistence, credentials, keylogging, evasion, or Windows prompt behavior.
- No broad TypeScript `readonly` migration.

## Decisions

1. Freeze after schema parsing.

   The parser remains the single authority for accepting trusted protocol envelopes. Invalid or redacted data continues to be handled before freezing, so the returned snapshot is both validated and stable.

2. Deep-freeze the current object graph.

   Top-level freeze alone would leave arrays and nested signal/audit objects mutable. A local recursive freezer covers the plain JSON-compatible structures returned by Zod.

3. Keep `encodeProtocolEnvelope` routed through `parseProtocolEnvelope`.

   Encoding should continue normalizing and redacting through the parser before serialization. Freezing the intermediate parsed value does not affect serialized output.

## Risks / Trade-offs

- Existing callers that mutate parsed envelopes will now fail at runtime -> Current repository search does not show valid dependency on mutation, and mutation after trust-boundary validation is unsafe.
- Recursive freeze adds overhead -> Protocol messages are bounded and small; the safety benefit outweighs this development-runtime cost.
- Type-only immutability would improve developer ergonomics -> Deferred to keep the change focused and avoid broad API churn.
