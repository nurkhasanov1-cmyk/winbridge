## 1. Shared Audit Snapshot Immutability

- [x] 1.1 Add a local immutable snapshot helper in `packages/protocol/src/audit.ts`.
- [x] 1.2 Route successful `createAuditRecord` outputs through immutable validated and redacted audit records without changing serialized JSON output.

## 2. Tests

- [x] 2.1 Add protocol audit tests proving returned records, actor metadata, target metadata, and nested detail metadata cannot be mutated in place.
- [x] 2.2 Add protocol audit tests proving redacted reason and detail values cannot be restored in place after creation.
- [x] 2.3 Verify JSON serialization still emits the same validated and redacted audit record shape.

## 3. Review and Verification

- [x] 3.1 Review the audit factory change for consent evidence, authorization audit integrity, redaction, log safety, and abuse-resistance impact.
- [x] 3.2 Run focused protocol audit tests.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.4 Sync and archive the OpenSpec change after implementation is verified.
