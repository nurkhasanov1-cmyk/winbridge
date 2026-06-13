## 1. OpenSpec

- [x] 1.1 Create proposal, design, delta spec, and tasks for viewer prompt shutdown after successful disconnect.
- [x] 1.2 Validate the active OpenSpec change in strict mode.

## 2. Implementation

- [x] 2.1 Update the viewer control prompt so successful local `disconnect` stops the prompt only after `leave()` succeeds.
- [x] 2.2 Preserve failure behavior so failed viewer `disconnect` reports a sanitized error and keeps the prompt available.
- [x] 2.3 Update README/security/architecture documentation for viewer control prompt lifecycle.

## 3. Verification

- [x] 3.1 Add focused tests for successful prompt shutdown and failed-disconnect prompt availability.
- [x] 3.2 Run focused agent-shell viewer-control prompt tests.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.4 Complete a safety/security review for the viewer control prompt lifecycle diff.

## 4. Completion

- [x] 4.1 Archive the OpenSpec change after implementation and verification.
- [x] 4.2 Commit and push the completed increment to GitHub.
