## 1. Grant Snapshot Immutability

- [x] 1.1 Add a local immutable snapshot helper in `packages/protocol/src/session.ts`.
- [x] 1.2 Route successful `assertConsentBoundGrant` outputs through the helper so the grant object and permission list are frozen.

## 2. Tests

- [x] 2.1 Add protocol tests proving accepted grant snapshots cannot mutate permission scope or consent/visibility flags.
- [x] 2.2 Verify existing expired, empty, duplicate, unknown-field, and unavailable-permission grant rejection behavior remains unchanged.

## 3. Review and Verification

- [x] 3.1 Review the grant change for consent, visibility, permission scope, and abuse-resistance impact.
- [x] 3.2 Run focused protocol grant tests.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.4 Sync and archive the OpenSpec change after implementation is verified.
