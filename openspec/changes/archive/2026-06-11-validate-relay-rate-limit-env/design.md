## Context

`createDevelopmentRateLimiter(env, prefix)` reads `<PREFIX>_LIMIT` and `<PREFIX>_WINDOW_MS`. It currently uses `Number.parseInt`, so malformed values can be truncated and accepted before `SlidingWindowRateLimiter` validates broad numeric bounds.

## Goals / Non-Goals

**Goals:**
- Reject ambiguous rate-limit env values before limiter construction.
- Keep defaults unchanged when env variables are omitted.
- Keep existing positive limit and minimum window requirements.

**Non-Goals:**
- No production distributed limiter.
- No change to invalid-message or invalid-token audit record shape.
- No change to relay token semantics.

## Decisions

1. Add an exact integer env parser inside `rate-limit.ts`.

   Rationale: the parser is local to limiter config and avoids adding dependency or widening the public protocol API.

2. Treat empty configured env values as malformed.

   Rationale: omitted variables should use defaults; explicitly present empty values are ambiguous and should fail fast.

## Risks / Trade-offs

- Local shells with accidental empty env variables will now fail at startup. Mitigation: the error names the offending variable, and explicit failure is preferable for abuse-control settings.
