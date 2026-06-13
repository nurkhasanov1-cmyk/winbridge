## 1. OpenSpec

- [x] 1.1 Validate `add-viewer-status-cli` strictly before implementation.

## 2. Implementation

- [x] 2.1 Add `--viewer-status-after-ms` parsing and managed option wiring with viewer-only bounded-delay validation.
- [x] 2.2 Add viewer status CLI scheduling and bounded status-line formatting based on `runtime.getViewerStatus()`.

## 3. Tests and Docs

- [x] 3.1 Add focused argument parsing and viewer status output tests.
- [x] 3.2 Document the viewer status CLI option and its safety boundaries.

## 4. Verification

- [x] 4.1 Run focused agent-shell tests for the new CLI status behavior.
- [x] 4.2 Review the diff against consent, visibility, revocation, audit redaction, and no-remote-action safety boundaries.
- [x] 4.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
