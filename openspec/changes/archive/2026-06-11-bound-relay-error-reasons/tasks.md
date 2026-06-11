## 1. Relay Error Normalization

- [x] 1.1 Add relay-local bounded rejection reason normalization for peer-facing errors and invalid-message audit reasons.
- [x] 1.2 Preserve existing safe policy reasons while mapping parser/schema failures to a generic safe reason.

## 2. Tests

- [x] 2.1 Add relay integration coverage for malformed JSON rejection using bounded relay-error and audit reasons.
- [x] 2.2 Run focused relay integration tests for rejection reason behavior.

## 3. Verification

- [x] 3.1 Run security review for relay error/audit surface impact.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
