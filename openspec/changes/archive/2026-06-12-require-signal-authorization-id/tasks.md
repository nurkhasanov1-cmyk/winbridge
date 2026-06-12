## 1. Protocol Schema

- [x] 1.1 Require top-level `payload.authorizationId` for `signal` messages and validate it as a protocol identifier.
- [x] 1.2 Preserve existing payload-size and sensitive-key rejection behavior with the new required field.

## 2. Relay And Tests

- [x] 2.1 Update accepted protocol, relay, and agent-shell signal fixtures to include valid authorization ids.
- [x] 2.2 Add protocol tests for missing and malformed signal payload authorization ids.
- [x] 2.3 Add relay integration coverage proving missing authorization-id signals are rejected before forwarding with secret-safe audit metadata.
- [x] 2.4 Update docs if operator-facing guidance needs to name the wire-contract requirement.

## 3. Verification

- [x] 3.1 Run focused protocol and relay tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Run a security review for the protocol/relay signaling validation diff.
