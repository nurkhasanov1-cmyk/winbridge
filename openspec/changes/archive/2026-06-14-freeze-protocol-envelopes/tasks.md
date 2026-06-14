## 1. Protocol Envelope Immutability

- [x] 1.1 Add a local immutable snapshot helper in `packages/protocol/src/messages.ts`.
- [x] 1.2 Route successful `parseProtocolEnvelope` and `decodeProtocolEnvelope` outputs through immutable parsed envelopes without changing encoding output.

## 2. Tests

- [x] 2.1 Add protocol tests proving parsed authorization envelopes and permission arrays cannot be mutated in place.
- [x] 2.2 Add protocol tests proving parsed signal payloads and audit details cannot be mutated in place after validation/redaction.
- [x] 2.3 Verify encoding still emits the same JSON-compatible wire shape.

## 3. Review and Verification

- [x] 3.1 Review the protocol parser change for consent, visibility, permission scope, signal safety, audit redaction, and abuse-resistance impact.
- [x] 3.2 Run focused protocol message tests.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.4 Sync and archive the OpenSpec change after implementation is verified.
