## 1. Runtime Status

- [x] 1.1 Store the last trusted remote host disconnect `reasonCode` in viewer session state without storing peer ids, display names, private reasons, or raw close text.
- [x] 1.2 Expose the optional bounded disconnect reason code from `getViewerStatus()` only after trusted remote host disconnect.

## 2. CLI Output And Docs

- [x] 2.1 Print optional viewer status disconnect reason code when present without sending protocol messages or invoking controls.
- [x] 2.2 Update README and security-model documentation for the new bounded status metadata and non-goals.

## 3. Tests And Verification

- [x] 3.1 Add focused unit/integration coverage for viewer status snapshots and formatter output.
- [x] 3.2 Run focused tests for the changed agent-shell behavior.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
