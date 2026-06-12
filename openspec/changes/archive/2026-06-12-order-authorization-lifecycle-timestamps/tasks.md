## 1. Implementation

- [x] 1.1 Add schema-level lifecycle timestamp ordering validation in `packages/protocol/src/authorization.ts`.
- [x] 1.2 Add focused protocol tests for activation-before-approval, resume-before-pause, terminal-before-live-state, and valid ordered partial revocation history.
- [x] 1.3 Sync the accepted requirement into `openspec/specs/session-authorization/spec.md`.

## 2. Verification

- [x] 2.1 Run focused authorization protocol tests.
- [x] 2.2 Run `npm run check`.
- [x] 2.3 Run `npm test` in CI mode if the interactive reporter hits the known local IPC issue.
- [x] 2.4 Run `npm run build`.
- [x] 2.5 Run `npm run openspec:validate`.
- [x] 2.6 Complete focused security review for authorization timestamp validation.
