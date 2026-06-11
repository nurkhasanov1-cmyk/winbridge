## Context

The protocol package owns the shared session authorization state machine. Pending authorization records currently default to a 30-minute TTL, but callers can pass arbitrary numeric `ttlMs` values. Invalid numeric values can produce malformed timestamps, immediately expired requests, or excessively long authorization windows.

This change only validates the factory input that creates pending authorization records. It does not change the authorization state machine's deny-by-default lifecycle, host approval requirements, visible activation gate, or action authorization checks.

## Goals / Non-Goals

**Goals:**

- Reject malformed pending authorization TTL inputs before creating authorization records.
- Bound explicit TTL values to the safe JavaScript timer delay range.
- Preserve the existing default TTL when `ttlMs` is omitted.
- Keep error messages bounded and free of protocol payloads or private reason text.

**Non-Goals:**

- No production account, device trust, token, or relay authorization changes.
- No changes to approval, denial, activation, revocation, pause/resume, termination, or expiration transitions beyond TTL input validation.
- No capture, input, clipboard, file transfer, installer, startup, service, or privilege behavior.

## Decisions

1. Use a shared numeric assertion for explicit pending authorization TTLs.

   The state machine API accepts numeric values, not environment strings. The validation will require `Number.isInteger(ttlMs)` and a bounded range. This rejects fractional, `NaN`, and infinite values without changing omitted-default behavior.

2. Require explicit TTLs to be positive and timer-safe.

   Explicit pending authorization TTLs will be limited to `1..2147483647` milliseconds. A zero TTL creates an immediately expired pending request that cannot be approved and is better represented through explicit expiration tests or transitions. Values above the JavaScript timer-safe delay range are not accepted.

## Risks / Trade-offs

- Tests or callers that used `ttlMs: 0` to create already-expired pending records will now need to create a short-lived authorization and evaluate it at a later `now`. This keeps the factory from producing unusable authorization records.
- The upper bound is an implementation safety bound, not production authorization policy. Production session duration policy needs a future OpenSpec change.
