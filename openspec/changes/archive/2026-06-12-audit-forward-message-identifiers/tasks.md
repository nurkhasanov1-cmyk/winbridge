## 1. Relay Audit Metadata

- [x] 1.1 Include parsed protocol `messageId` in accepted forward audit detail.
- [x] 1.2 Preserve recipient routing metadata for all accepted forwarded messages.
- [x] 1.3 Preserve signal `authorizationId` metadata without copying other payload keys.

## 2. Tests And Docs

- [x] 2.1 Update signal forward audit coverage for exact detail keys including `messageId`.
- [x] 2.2 Update non-signal forward audit coverage for exact detail keys including `messageId`.
- [x] 2.3 Update docs if operator-facing relay audit guidance needs to name forwarded message identifiers.

## 3. Verification

- [x] 3.1 Run focused relay integration tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Run a security review for the relay audit/message identifier metadata diff.
