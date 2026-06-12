## 1. Protocol Contract

- [x] 1.1 Add shared protocol validation that rejects untrimmed `hello.capabilities` entries.
- [x] 1.2 Add shared protocol validation that rejects capability duplicates after trimming.
- [x] 1.3 Add focused protocol tests for untrimmed and trim-duplicate capability rejection.

## 2. Runtime Boundaries

- [x] 2.1 Add relay integration coverage proving malformed capability metadata is rejected before forwarding with secret-safe rejection metadata.
- [x] 2.2 Add agent-shell integration coverage proving inbound malformed capability metadata is treated as unsafe raw input and does not establish peer presence.
- [x] 2.3 Add agent-shell integration coverage proving public `send()` rejects malformed `hello` capabilities before socket write and local `sent` events.

## 3. Verification and Review

- [x] 3.1 Run focused protocol, relay, and agent-shell tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Perform a security review of relay validation, agent-shell local event/log exposure, and OpenSpec impact.
