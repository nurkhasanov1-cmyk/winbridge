## 1. Runtime Implementation

- [x] 1.1 Add host-only managed runtime `pause()` and `resume()` controls with visible state-specific authorization gating.
- [x] 1.2 Store host workflow state in session state and make delayed/direct pause/resume share it.
- [x] 1.3 Preserve audit fail-closed behavior and sanitized diagnostics for direct pause/resume audit failures.

## 2. Tests And Documentation

- [x] 2.1 Add integration tests for direct pause/resume success, host-only rejection, precondition rejection, audit persistence, audit failure, and coherence with delayed timers.
- [x] 2.2 Update architecture and security docs for direct local pause/resume controls.

## 3. Verification

- [x] 3.1 Run targeted agent-shell runtime integration tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Complete security review for authorization lifecycle, visible-session, pause/resume, and audit/logging surfaces.
