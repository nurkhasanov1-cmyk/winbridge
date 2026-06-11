## Why

Relay invalid-token and invalid-message rate limits are configured through development environment variables. The parser currently uses `Number.parseInt`, which accepts partial numeric strings such as `5x`; malformed limiter configuration should fail before the relay starts so abuse controls are not accidentally configured with unintended values.

## What Changes

- Parse rate-limit limit/window environment values as exact decimal integers.
- Preserve existing defaults and constructor bounds: positive limits and windows at least 1000 ms.
- Reject empty, partial, fractional, negative, zero-limit, and too-small-window values before creating the limiter.
- Non-goals: no distributed production limiter, no persistence, no token/auth model changes.

## Capabilities

### New Capabilities

### Modified Capabilities
- `relay-abuse-protection`: Development rate-limit environment configuration rejects malformed values before runtime use.

## Impact

- Affected code: `apps/relay/src/rate-limit.ts`, `apps/relay/src/rate-limit.test.ts`, docs, and OpenSpec artifacts.
- Safety impact: strengthens relay abuse-control configuration. Does not add remote access, capture, input, stealth, persistence, credential access, or evasion behavior.
