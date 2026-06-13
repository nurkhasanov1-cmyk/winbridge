## 1. OpenSpec

- [x] 1.1 Create proposal, design, and delta specs for file-transfer permission rejection.
- [x] 1.2 Validate the active OpenSpec change strictly before implementation.

## 2. Shared Validation

- [x] 2.1 Update shared permission validation so `file-transfer` rejects at runtime while existing implemented permissions remain valid.
- [x] 2.2 Add authorization state-machine tests for file-transfer rejection in request, grant, parsed record, consent-bound grant, revocation, and action-check paths.
- [x] 2.3 Add protocol message tests for file-transfer rejection in request, decision, state, permission-revoked, session-control, and legacy consent paths.

## 3. Agent Shell and Docs

- [x] 3.1 Add agent-shell CLI tests rejecting file-transfer permission scope before runtime startup.
- [x] 3.2 Add managed runtime option tests rejecting file-transfer permission scope before relay startup.
- [x] 3.3 Update security and architecture documentation with the file-transfer capability freeze.
- [x] 3.4 Review the diff for fail-open file-transfer access, capture/input side effects, raw file exposure, and skipped or weakened authorization checks.

## 4. Verification

- [x] 4.1 Run focused protocol and agent-shell tests for file-transfer rejection.
- [x] 4.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 4.3 Archive the completed OpenSpec change after implementation and verification.
