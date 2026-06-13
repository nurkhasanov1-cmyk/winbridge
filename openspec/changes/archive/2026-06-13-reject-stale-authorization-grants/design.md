## Context

`SessionAuthorizationSchema` requires `expiresAt` to be after `createdAt`, but protocol-level approval and state messages currently only check that `expiresAt` is present and syntactically valid. That leaves direct protocol envelopes able to describe an already-expired grant as approved, active, or paused.

The relay and agent shell both validate protocol envelopes before forwarding or processing them, so schema-level validation is the narrowest place to enforce this fail-closed rule.

## Goals / Non-Goals

**Goals:**

- Reject approved authorization decisions whose `expiresAt` is not after the envelope `createdAt`.
- Reject grant-bearing state updates (`approved`, `active`, `paused`) whose `expiresAt` is not after the envelope `createdAt`.
- Preserve terminal/fail-closed state updates, especially `expired`, that report an already-passed expiration time.

**Non-Goals:**

- Do not change authorization TTL configuration or runtime scheduling.
- Do not require terminal states to have future expiration times.
- Do not add remote access capabilities, capture, input, installer, startup, services, or privilege behavior.

## Decisions

- Add a small shared helper in `messages.ts` for `expiresAt > createdAt`.
  - Rationale: both approved decisions and grant-bearing state updates need the same comparison, and centralized wording keeps diagnostics consistent.
  - Alternative considered: compare at runtime only. That would miss direct protocol users and relay forwarding validation.

- Apply the helper only to grant-bearing authorization envelopes.
  - Rationale: `approved`, `active`, and `paused` imply usable grants, so stale expiration is fail-open ambiguity. `expired`, `revoked`, `terminated`, `denied`, and `pending` are fail-closed or pre-grant states and can legitimately carry no usable future grant.
  - Alternative considered: require every state update to have future `expiresAt`. That would reject correct `expired` notifications generated after the TTL boundary.

## Risks / Trade-offs

- Older test or development clients that hand-craft approved/live messages with stale expirations will now be rejected. -> That is the intended fail-closed behavior; local agent-shell already creates future expirations for approved/live states.
- This compares protocol envelope timestamps rather than wall-clock receipt time. -> It blocks internally stale messages without introducing clock-skew dependence between peers.
