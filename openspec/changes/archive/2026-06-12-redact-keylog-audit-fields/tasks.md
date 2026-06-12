## 1. Implementation

- [x] 1.1 Add `keylog` / `keylogger` audit detail key redaction in `packages/protocol/src/audit.ts`.
- [x] 1.2 Add focused shared audit redaction tests for direct, decorated, nested, and array keylogging detail keys.
- [x] 1.3 Add file audit sink coverage proving keylogging detail markers are not persisted.
- [x] 1.4 Sync accepted requirements into `openspec/specs/audit-foundation/spec.md` and `openspec/specs/audit-log-persistence/spec.md`.

## 2. Verification

- [x] 2.1 Run focused protocol and audit-log tests.
- [x] 2.2 Run `npm run check`.
- [x] 2.3 Run `npm test`.
- [x] 2.4 Run `npm run build`.
- [x] 2.5 Run `npm run openspec:validate`.
- [x] 2.6 Complete focused security review for audit/logging redaction behavior.
