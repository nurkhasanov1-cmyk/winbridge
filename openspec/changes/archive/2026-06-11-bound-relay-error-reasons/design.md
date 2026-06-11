## Context

The relay rejects malformed JSON, malformed protocol envelopes, join failures, forged disconnect notices, session mismatches, unsafe signal payloads, oversized messages, and rate-limit events. Many of these paths currently use `error.message` directly as the user-facing `relay-error.reason` and audit `reason`.

## Goals / Non-Goals

**Goals:**

- Keep peer-facing and audited rejection reasons bounded and secret-safe.
- Avoid exposing parser, JSON, or Zod internals for malformed protocol input.
- Preserve deterministic safe reason strings for policy failures that tests and operators use.
- Keep raw input, raw protocol payloads, raw tokens, pairing codes, credentials, keystrokes, screenshots, and screen contents out of error surfaces.

**Non-Goals:**

- No new error-code schema in `packages/protocol`.
- No production observability or localization system.
- No changes to relay room semantics, pairing semantics, capture, input, installer, services, startup, or privilege behavior.

## Decisions

- Add a small relay-local `safeRelayRejectionReason` function. This keeps the change scoped to the development relay and avoids changing protocol contracts.
- Use an allow-list for known safe policy reasons and a generic fallback for parser/schema errors. Allow-listing is safer than trying to redact arbitrary parser messages.
- Use the normalized reason consistently for `relay-error.reason` and `relay.message.rejected.reason`.
- Keep join-denial audit reasons specific only when they are known policy reasons, such as missing or mismatched pairing. Malformed first messages use the generic fallback.

## Risks / Trade-offs

- Less detailed peer-facing parser errors can make manual debugging slower -> acceptable because detailed malformed input must not be exposed across peer boundaries.
- Future safe relay policies need to be added to the allow-list -> tests should cover any new public reason.
