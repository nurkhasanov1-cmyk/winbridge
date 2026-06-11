## 1. Rate Limit Env Validation

- [x] 1.1 Add rate-limit tests for default and explicit valid environment configuration.
- [x] 1.2 Add rate-limit tests rejecting empty, partial, fractional, negative, zero-limit, and too-small-window env values.
- [x] 1.3 Implement exact integer parsing in `createDevelopmentRateLimiter`.
- [x] 1.4 Update docs if relay rate-limit configuration notes need clarification.

## 2. Verification

- [x] 2.1 Run focused rate-limit tests.
- [x] 2.2 Run `npm run check`.
- [x] 2.3 Run `npm test`.
- [x] 2.4 Run `npm run build`.
- [x] 2.5 Run `npm run openspec:validate`.
- [x] 2.6 Archive the OpenSpec change after implementation and verification are complete.
