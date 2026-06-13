## 1. CLI And Prompt Implementation

- [x] 1.1 Add `--host-control-prompt true|false` argument parsing with host-only and host-consent-prompt mutual-exclusion validation.
- [x] 1.2 Add an interactive host control prompt helper that parses exact commands and calls managed runtime direct controls.
- [x] 1.3 Ensure invalid commands and runtime failures are fail-closed and secret-safe.
- [x] 1.4 Wire the prompt into `apps/agent-shell/src/index.ts` lifecycle startup and shutdown.

## 2. Tests And Documentation

- [x] 2.1 Add CLI argument tests for host control prompt parsing and rejection.
- [x] 2.2 Add focused prompt tests for accepted commands, malformed commands, permission validation, runtime failure redaction, and prompt close behavior.
- [x] 2.3 Update README, architecture, and security docs for the opt-in development host control prompt.

## 3. Verification

- [x] 3.1 Run targeted agent-shell argument and host-control prompt tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Complete security review for consent, host-only controls, CLI diagnostics, audit/logging, and prompt stdin behavior.
