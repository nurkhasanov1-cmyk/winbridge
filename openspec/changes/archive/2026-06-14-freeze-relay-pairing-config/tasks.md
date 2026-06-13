## 1. Implementation

- [x] 1.1 Return a frozen validated pairing config snapshot from `normalizeRelayPairingConfig()`.
- [x] 1.2 Add focused tests proving normalized pairing settings cannot be mutated after validation.
- [x] 1.3 Add a room-registry regression test proving caller mutation after construction cannot change pairing ticket behavior.

## 2. Verification

- [x] 2.1 Run focused relay room tests.
- [x] 2.2 Complete security review for the relay pairing diff.
- [x] 2.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 2.4 Sync the completed OpenSpec delta into main specs and archive the change.
