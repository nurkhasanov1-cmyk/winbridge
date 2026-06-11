## 1. Protocol Redaction

- [x] 1.1 Apply existing audit detail redaction to protocol `audit-event` message detail parsing.
- [x] 1.2 Ensure `encodeProtocolEnvelope` emits redacted audit-event details.
- [x] 1.3 Preserve default empty detail objects for audit-event messages without details.

## 2. Tests

- [x] 2.1 Add protocol tests for top-level sensitive audit-event detail redaction.
- [x] 2.2 Add protocol tests for nested object and array sensitive detail redaction.
- [x] 2.3 Add protocol tests for audit-event encoding and omitted detail defaults.

## 3. Review And Verification

- [x] 3.1 Run security review for protocol audit-event redaction behavior.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Archive the completed OpenSpec change and verify no active changes remain.
