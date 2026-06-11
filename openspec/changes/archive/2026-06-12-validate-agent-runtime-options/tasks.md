## 1. Runtime Validation

- [x] 1.1 Add managed runtime option validation before relay URL mutation or WebSocket startup.
- [x] 1.2 Validate direct relay URL, role, identifiers, display name, token, permissions, visible-session flag, timers, and decision/lifecycle reasons with bounded secret-safe errors.
- [x] 1.3 Share timer and lifecycle reason bounds with CLI parsing without changing CLI behavior.

## 2. Verification

- [x] 2.1 Add focused regression tests for malformed direct runtime options before relay startup.
- [x] 2.2 Update development security/architecture documentation for runtime option validation.
- [x] 2.3 Run focused agent-shell runtime and argument tests.
- [x] 2.4 Run `npm run check`.
- [x] 2.5 Run `npm test`.
- [x] 2.6 Run `npm run build`.
- [x] 2.7 Run `npm run openspec:validate`.
- [x] 2.8 Complete a security review for the consent/auth/networking/token/log-adjacent workflow change.
