## 1. OpenSpec

- [x] 1.1 Create proposal, design, and delta specs for clipboard permission rejection.
- [x] 1.2 Validate the active OpenSpec change strictly before implementation.

## 2. Shared Validation

- [x] 2.1 Update shared permission validation so `clipboard:read` and `clipboard:write` reject at runtime while existing implemented permissions remain valid.
- [x] 2.2 Add authorization state-machine tests for clipboard permission rejection in request, grant, parsed record, consent-bound grant, revocation, and action-check paths.
- [x] 2.3 Add protocol message tests for clipboard permission rejection in request, decision, state, permission-revoked, session-control, and legacy consent paths.

## 3. Agent Shell and Docs

- [x] 3.1 Add agent-shell CLI tests rejecting clipboard permission scopes before runtime startup.
- [x] 3.2 Add managed runtime option tests rejecting clipboard permission scopes before relay startup.
- [x] 3.3 Update security and architecture documentation with the clipboard capability freeze.
- [x] 3.4 Review the diff for fail-open clipboard access, capture/input side effects, raw clipboard exposure, and skipped or weakened authorization checks.

## 4. Verification

- [x] 4.1 Run focused protocol and agent-shell tests for clipboard rejection.
- [x] 4.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 4.3 Archive the completed OpenSpec change after implementation and verification.
