## 1. Runtime Implementation

- [x] 1.1 Add host-only managed runtime `revokePermission(permission)` with visible active/paused authorization gating.
- [x] 1.2 Refactor delayed and direct revocation to share host workflow state and protocol/audit behavior.
- [x] 1.3 Preserve audit fail-closed behavior and sanitized diagnostics for direct revocation audit failures.

## 2. Tests And Documentation

- [x] 2.1 Add integration tests for direct revocation success, paused revocation, host-only rejection, precondition rejection, missing-permission rejection, audit persistence, audit failure, and timer coherence.
- [x] 2.2 Update architecture and security docs for direct local revocation control.

## 3. Verification

- [x] 3.1 Run targeted agent-shell runtime integration tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Complete security review for authorization lifecycle, visible-session, revocation, and audit/logging surfaces.
