## 1. Specification

- [x] 1.1 Validate the OpenSpec change artifacts in strict mode.

## 2. Implementation

- [x] 2.1 Add shared display-name validation for secret-bearing metadata.
- [x] 2.2 Update README and security model documentation for display-name secret-bearing metadata boundaries.

## 3. Tests

- [x] 3.1 Add identity schema tests for secret-bearing and safe display names.
- [x] 3.2 Add protocol message tests for secret-bearing `hello` and legacy consent display names.
- [x] 3.3 Add agent-shell CLI/runtime tests for secret-bearing and safe display names.
- [x] 3.4 Perform a focused security review of the diff for consent, visibility, revocation, audit, and secret exposure invariants.

## 4. Verification

- [x] 4.1 Run focused tests for identity, protocol messages, and agent-shell display-name validation.
- [x] 4.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 4.3 Archive the completed OpenSpec change and rerun strict OpenSpec validation.
