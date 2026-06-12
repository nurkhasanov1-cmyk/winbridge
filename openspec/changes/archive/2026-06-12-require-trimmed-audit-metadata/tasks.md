## 1. Audit Metadata Validation

- [x] 1.1 Require shared audit record `action`, top-level `reason`, and `target.type` values to be already trimmed.
- [x] 1.2 Require protocol `audit-event.action` values to be already trimmed.
- [x] 1.3 Add focused audit and protocol tests for untrimmed audit metadata rejection.

## 2. Specs, Docs, Verification, and Review

- [x] 2.1 Sync main OpenSpec specs and docs with canonical audit metadata requirements.
- [x] 2.2 Run focused audit and protocol tests.
- [x] 2.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 2.4 Perform a security review of audit metadata validation, protocol audit-event handling, diagnostics, logging, and OpenSpec impact.
