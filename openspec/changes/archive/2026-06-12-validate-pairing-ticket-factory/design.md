## Context

The protocol package owns pairing ticket schemas and helper functions. `PairingTicketSchema` validates serialized ticket shape, but `createPairingTicket` currently computes expiration timestamps and remaining uses before an explicit factory-level check. Invalid numeric inputs can lead to invalid timestamps or unusable tickets, and relying on later schema parse creates less clear failure behavior.

Relay configuration already validates its own pairing settings before constructing tickets. This change adds the same fail-fast posture to the shared protocol factory for callers outside the relay runtime.

## Goals / Non-Goals

**Goals:**

- Reject malformed pairing ticket TTL and max-use factory inputs before creating ticket records.
- Preserve existing default TTL and max-use behavior when omitted.
- Keep `ttlMs: 0` valid for immediate-expiration test cases and relay rejection scenarios.
- Keep error messages bounded and free of raw pairing codes or protocol payloads.

**Non-Goals:**

- No production account, device trust, durable pairing storage, or reconnect design.
- No changes to relay environment configuration bounds or room admission semantics.
- No changes to consent-bound session authorization, approval, visibility, revocation, pause/resume, or action authorization.
- No capture, input, clipboard, file transfer, installer, startup, service, or privilege behavior.

## Decisions

1. Use explicit numeric assertions in `createPairingTicket`.

   The factory accepts numbers rather than environment strings, so validation will require integer finite values. This rejects fractional, `NaN`, infinite, and out-of-range values before ticket serialization.

2. Allow zero TTL but reject zero max uses.

   A zero TTL is already used to model immediate expiration in relay tests. A zero-use ticket is not useful at creation time and can be represented by consuming a valid one-use ticket instead, so max uses remains `1..10`.

3. Use the JavaScript timer-safe upper bound for protocol TTL.

   The protocol helper allows TTL values up to `2_147_483_647` milliseconds. Relay runtime configuration remains stricter at 24 hours for local development admission windows.

## Risks / Trade-offs

- Callers that previously passed invalid values and relied on schema errors will now receive explicit factory errors earlier.
- Protocol-level TTL maximum is broader than relay runtime policy. This keeps the shared protocol helper general while allowing relay configuration to stay stricter.
