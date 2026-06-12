## 1. Protocol Contract

- [x] 1.1 Add a shared recursive JSON-compatible audit detail schema and type in `packages/protocol/src/audit.ts`.
- [x] 1.2 Use the shared audit detail schema for `AuditRecordSchema` and protocol `audit-event` messages.

## 2. Tests And Documentation

- [x] 2.1 Add protocol audit record tests for accepted JSON-compatible detail values and rejected non-JSON detail values.
- [x] 2.2 Add protocol `audit-event` parse/encode tests for accepted JSON-compatible detail values and rejected non-JSON detail values.
- [x] 2.3 Update audit-log sink tests so successful paths use JSON-compatible details and file writes reject non-JSON detail before appending.
- [x] 2.4 Document the JSON-compatible audit detail contract.

## 3. Verification And Review

- [x] 3.1 Run focused tests for protocol audit, protocol messages, and audit-log sinks.
- [x] 3.2 Run `npm run check`.
- [x] 3.3 Run `npm test`.
- [x] 3.4 Run `npm run build`.
- [x] 3.5 Run `npm run openspec:validate`.
- [x] 3.6 Complete security review for the audit/logging change and address findings.
