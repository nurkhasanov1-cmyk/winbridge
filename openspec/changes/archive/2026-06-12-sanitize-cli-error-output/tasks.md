## 1. CLI Diagnostics

- [x] 1.1 Add relay CLI unexpected-error formatter and replace raw `console.error(error)` startup/shutdown output.
- [x] 1.2 Add agent-shell CLI unexpected-error formatter and replace raw `console.error(error)` startup/shutdown output while preserving static usage errors.
- [x] 1.3 Add focused tests proving relay and agent-shell unexpected CLI error formatting does not expose raw messages, stacks, tokens, or file paths.

## 2. Documentation and Specs

- [x] 2.1 Update architecture and security documentation to describe metadata-only unexpected CLI error output.
- [x] 2.2 Sync accepted delta requirements into `openspec/specs/relay-runtime/spec.md` and `openspec/specs/agent-shell-consent-workflow/spec.md`.

## 3. Verification and Review

- [x] 3.1 Run focused CLI diagnostic tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Complete security review for CLI error output handling.
- [x] 3.4 Archive the completed OpenSpec change after validation.
