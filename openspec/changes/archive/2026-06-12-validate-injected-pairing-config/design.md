## Context

The development relay supports host-created pairing tickets. Pairing ticket TTL and maximum-use values can come from:

- CLI/environment through `createRelayPairingConfig(process.env)`.
- Direct runtime injection through `createRelayRuntime({ pairing })`.
- Direct room registry construction through `new RoomRegistry(config)`.

The environment path rejects malformed strings. Direct injection uses numeric TypeScript types, but JavaScript callers can still pass `null`, strings, `NaN`, or infinite values. The current defaulting pattern should not silently treat malformed injected values as omitted.

## Goals / Non-Goals

**Goals:**

- Reject malformed injected `ticketTtlMs` values before creating host pairing tickets.
- Reject malformed injected `maxUses` values before creating host pairing tickets.
- Preserve existing defaults when the values are genuinely omitted.
- Preserve valid bounds: TTL from 0 through 86400000 ms and max uses from 1 through 10.

**Non-Goals:**

- No production identity, account, MFA, RBAC, reconnect, or token lifecycle design.
- No changes to pairing code hashing, ticket consumption semantics, room size, relay tokens, audit content, or rate limiting.
- No changes to consent, authorization state machine, capture, input, clipboard, file transfer, diagnostics, installer, startup, service, or privilege behavior.

## Decisions

1. Default only when injected fields are `undefined`.
   - Rationale: omitted values keep documented development defaults; `null` is malformed input and should be rejected.

2. Keep exact numeric integer checks for injected settings.
   - Rationale: injected values are already expected to be numbers; accepting strings or coercing values would hide caller errors.

3. Leave environment exact-string parsing unchanged.
   - Rationale: environment parsing already rejects empty, partial, fractional, negative, zero-use, and out-of-range strings.

## Risks / Trade-offs

- Programmatic callers that pass `null` or string values will now fail during configuration normalization instead of using defaults or failing later. This is intended fail-closed behavior.

## Migration Plan

Omit fields to use defaults, or pass exact integer numbers within the documented bounds.

## Open Questions

None.
