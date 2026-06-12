## 1. Implementation

- [x] 1.1 Reject malformed injected `ticketTtlMs` values during relay pairing config normalization.
- [x] 1.2 Reject malformed injected `maxUses` values during relay pairing config normalization.
- [x] 1.3 Preserve omitted defaults, `ticketTtlMs: 0`, and valid max-use bounds.
- [x] 1.4 Update architecture/security docs for injected pairing setting validation.

## 2. Verification

- [x] 2.1 Add focused room/runtime tests for invalid injected pairing settings and valid defaults.
- [x] 2.2 Run focused relay room and runtime tests.
- [x] 2.3 Complete security review for the relay pairing configuration diff.
- [x] 2.4 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 2.5 Sync the completed OpenSpec delta into main specs and archive the change.
