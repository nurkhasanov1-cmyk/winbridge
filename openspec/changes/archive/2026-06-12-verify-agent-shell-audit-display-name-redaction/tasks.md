## 1. Coverage

- [x] 1.1 Add focused agent-shell integration coverage for persisted host workflow audit records with private display-name and lifecycle-reason markers.
- [x] 1.2 Verify persisted workflow audit records retain safe metadata and exclude raw display names, pairing codes, signal payload markers, protocol payload markers, and private reason text.

## 2. Verification

- [x] 2.1 Run focused agent-shell runtime integration tests.
- [x] 2.2 Complete security review for the audit/log coverage diff.
- [x] 2.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 2.4 Sync the completed OpenSpec delta into main specs and archive the change.
