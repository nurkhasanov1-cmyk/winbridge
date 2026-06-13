## 1. OpenSpec

- [x] 1.1 Validate `add-viewer-local-disconnect-cli` strictly before implementation.

## 2. Implementation

- [x] 2.1 Add `--viewer-disconnect-after-ms` parsing and index wiring with viewer-only bounded-delay validation.
- [x] 2.2 Add a viewer local disconnect scheduler that calls only `runtime.stop()` and reports sanitized failures.

## 3. Tests and Docs

- [x] 3.1 Add focused argument parsing and scheduler unit tests.
- [x] 3.2 Add integration coverage proving scheduled viewer local disconnect closes the viewer and the host receives relay-originated `peer-disconnected`.
- [x] 3.3 Document the viewer local disconnect CLI option and safety boundaries.

## 4. Verification

- [x] 4.1 Run focused tests for viewer local disconnect behavior.
- [x] 4.2 Review the diff against consent, visibility, revocation, audit redaction, and no-remote-action safety boundaries.
- [x] 4.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
