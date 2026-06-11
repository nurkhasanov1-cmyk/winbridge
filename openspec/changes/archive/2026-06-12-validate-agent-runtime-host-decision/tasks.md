## 1. Runtime Guard

- [x] 1.1 Add runtime validation for `hostDecision` in `apps/agent-shell/src/runtime.ts`.
- [x] 1.2 Add a defensive authorization handler branch that fails closed for unexpected host decision values.

## 2. Verification

- [x] 2.1 Add a focused regression test proving malformed runtime `hostDecision` values are rejected before relay startup.
- [x] 2.2 Update development security documentation to describe runtime host decision validation.
- [x] 2.3 Run focused agent-shell runtime tests.
- [x] 2.4 Run `npm run check`.
- [x] 2.5 Run `npm test`.
- [x] 2.6 Run `npm run build`.
- [x] 2.7 Run `npm run openspec:validate`.
- [x] 2.8 Complete a security review for the consent/auth workflow change.
