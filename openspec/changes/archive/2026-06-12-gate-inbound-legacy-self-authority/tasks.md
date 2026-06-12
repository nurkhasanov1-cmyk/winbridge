## 1. Inbound Runtime Gate

- [x] 1.1 Add legacy `host-consent-decision` to the inbound self-authority workflow predicate.
- [x] 1.2 Preserve legacy `host-consent-required` request behavior as non-granting request semantics.

## 2. Verification Coverage

- [x] 2.1 Extend integration coverage for self-origin legacy `host-consent-decision` filtering before `received` events and workflow logs.
- [x] 2.2 Verify ignored self-authority diagnostics do not leak legacy decision type, peer ids, private reasons, grant markers, or raw-token markers.
- [x] 2.3 Sync main agent-shell consent workflow spec and docs.

## 3. Review And Gates

- [x] 3.1 Run focused agent-shell self-authority tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Perform security review for auth/log handling and archive the completed OpenSpec change.
