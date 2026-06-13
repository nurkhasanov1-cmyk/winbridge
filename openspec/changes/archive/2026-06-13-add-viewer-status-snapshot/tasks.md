## 1. OpenSpec

- [x] 1.1 Add an agent-shell-consent-workflow delta for viewer read-only status snapshots.
- [x] 1.2 Validate the active OpenSpec change strictly before implementation.

## 2. Implementation

- [x] 2.1 Add a viewer status snapshot type and `getViewerStatus()` runtime method.
- [x] 2.2 Implement viewer-only status derivation from local viewer authorization state without side effects.

## 3. Verification

- [x] 3.1 Add integration coverage for viewer status across inactive, active, paused, invisible, and terminal states.
- [x] 3.2 Add coverage proving host runtimes reject viewer status reads.
- [x] 3.3 Run focused agent-shell runtime tests.
- [x] 3.4 Run safety review for read-only status semantics and OpenSpec impact.
- [x] 3.5 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.6 Archive the completed OpenSpec change after verification.
