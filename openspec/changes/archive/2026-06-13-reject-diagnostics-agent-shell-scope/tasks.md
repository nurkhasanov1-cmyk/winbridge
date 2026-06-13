## 1. OpenSpec

- [x] 1.1 Create proposal, design, and delta specs for agent-shell diagnostics permission rejection.
- [x] 1.2 Validate the active OpenSpec change strictly before implementation.

## 2. Agent Shell Regression Coverage

- [x] 2.1 Add CLI argument tests rejecting `diagnostics:view` in request, grant, and revoke options.
- [x] 2.2 Add managed runtime option tests rejecting `diagnostics:view` before relay startup.
- [x] 2.3 Add host control prompt tests rejecting `revoke diagnostics:view` before managed control invocation.

## 3. Documentation

- [x] 3.1 Update security, architecture, and README docs to describe the diagnostics capability freeze on agent-shell surfaces.
- [x] 3.2 Review the diff for diagnostics exposure, capture/input side effects, weakened authorization checks, or accidental capability addition.

## 4. Verification

- [x] 4.1 Run focused agent-shell tests for diagnostics rejection.
- [x] 4.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 4.3 Archive the completed OpenSpec change after implementation and verification.
