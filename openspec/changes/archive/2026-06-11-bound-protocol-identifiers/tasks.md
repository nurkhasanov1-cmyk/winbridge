## 1. Protocol Schema Coverage

- [x] 1.1 Add protocol message tests that accept current development identifiers and reject oversized, whitespace, control-character, and unsafe-delimiter identifiers.
- [x] 1.2 Add identity and pairing tests for bounded `deviceId`, `pairingId`, `sessionId`, and paired-device identifiers.
- [x] 1.3 Add authorization/session grant tests for bounded authorization, session, peer, and audit identifiers.
- [x] 1.4 Add relay integration coverage proving malformed join identifiers are rejected before registration and reflected/audited only as bounded secret-safe errors.

## 2. Implementation

- [x] 2.1 Add shared protocol identifier schemas in `packages/protocol/src/session.ts`.
- [x] 2.2 Apply shared identifier schemas across protocol messages, authorization records, session grants, device identity, pairing tickets, and paired-device records.
- [x] 2.3 Keep relay malformed-identifier handling on the existing generic invalid-message rejection path.
- [x] 2.4 Update docs if public examples or safety notes need identifier constraint clarification.

## 3. Review And Verification

- [x] 3.1 Run focused protocol, identity, authorization, and relay tests.
- [x] 3.2 Run `npm run check`.
- [x] 3.3 Run `npm test`.
- [x] 3.4 Run `npm run build`.
- [x] 3.5 Run `npm run openspec:validate`.
- [x] 3.6 Run security review for the relay/auth/log metadata validation change.
- [x] 3.7 Archive the OpenSpec change after implementation and verification are complete.
