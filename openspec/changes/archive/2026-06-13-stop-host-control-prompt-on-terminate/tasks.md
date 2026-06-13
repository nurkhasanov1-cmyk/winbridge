## 1. OpenSpec

- [x] 1.1 Create proposal, design, delta spec, and tasks for host prompt shutdown after successful terminate.
- [x] 1.2 Validate the active OpenSpec change in strict mode.

## 2. Implementation

- [x] 2.1 Update the host control prompt so successful `terminate` stops the prompt locally.
- [x] 2.2 Preserve failure behavior so failed `terminate` reports a sanitized error and keeps the prompt available.
- [x] 2.3 Update README/security/architecture documentation for host control prompt terminal lifecycle.

## 3. Verification

- [x] 3.1 Add focused tests for successful terminate prompt shutdown and failed-terminate prompt availability.
- [x] 3.2 Run focused agent-shell host-control prompt tests.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.4 Complete a safety/security review for the host control prompt terminal lifecycle diff.

## 4. Completion

- [x] 4.1 Archive the OpenSpec change after implementation and verification.
- [x] 4.2 Commit and push the completed increment to GitHub.
