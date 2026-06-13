## 1. OpenSpec

- [x] 1.1 Validate the new change strictly before implementation.

## 2. Implementation

- [x] 2.1 Add shared secret-bearing action validation in `packages/protocol/src/audit.ts` without changing existing non-secret action names.
- [x] 2.2 Apply the shared validation to protocol `audit-event.action` parsing and encoding in `packages/protocol/src/messages.ts`.
- [x] 2.3 Add protocol and audit-log tests proving secret-bearing actions are rejected without raw action leakage or sink output.
- [x] 2.4 Add relay integration coverage proving secret-bearing `audit-event.action` is rejected before forwarding with secret-safe rejection metadata.

## 3. Verification

- [x] 3.1 Run focused tests for protocol, audit-log, and relay coverage.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Perform a security review for audit, relay, and log changes.
- [x] 3.4 Archive the completed OpenSpec change after implementation and validation.
