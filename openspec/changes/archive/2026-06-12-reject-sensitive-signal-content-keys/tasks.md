## 1. Protocol Boundary

- [x] 1.1 Extend `signal` payload sensitive-key indicators for clipboard, file-transfer, and diagnostics content names.
- [x] 1.2 Add focused protocol tests for nested clipboard, file-transfer, and diagnostics signal payload key rejection while preserving safe identifiers.

## 2. Relay Verification

- [x] 2.1 Extend relay integration coverage proving the new unsafe `signal` payload keys are rejected before forwarding.
- [x] 2.2 Verify relay rejection audit metadata does not include raw clipboard, file-transfer, diagnostics, or auth/session secret content.

## 3. Documentation And Specs

- [x] 3.1 Update security and architecture docs to name the expanded `signal` payload boundary.
- [x] 3.2 Run focused protocol/relay tests.
- [x] 3.3 Complete security review for the relay/protocol safety diff.
- [x] 3.4 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.5 Sync the completed OpenSpec delta into main specs and archive the change.
