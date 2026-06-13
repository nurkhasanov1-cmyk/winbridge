## 1. Protocol Validation

- [x] 1.1 Add protocol validation that rejects approved authorization decisions whose `expiresAt` is not after message `createdAt`.
- [x] 1.2 Add protocol validation that rejects grant-bearing authorization state updates whose `expiresAt` is not after message `createdAt` while preserving fail-closed expired state updates.
- [x] 1.3 Add focused protocol tests for stale approved decisions, stale live state updates, and accepted expired state notifications.

## 2. Verification

- [x] 2.1 Run the focused protocol message tests.
- [x] 2.2 Run `npm run check`.
- [x] 2.3 Run `npm test`.
- [x] 2.4 Run `npm run build`.
- [x] 2.5 Run `npm run openspec:validate`.
- [x] 2.6 Complete security review for the auth/protocol validation change.
