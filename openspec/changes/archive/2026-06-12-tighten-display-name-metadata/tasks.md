## 1. Protocol Contract

- [x] 1.1 Add shared display-name validation that rejects leading or trailing whitespace.
- [x] 1.2 Add focused protocol tests for device identity, `hello`, and legacy consent request display names.

## 2. Runtime Boundaries

- [x] 2.1 Update agent-shell CLI/runtime option tests for untrimmed display-name rejection.
- [x] 2.2 Add relay integration coverage proving untrimmed display names are rejected before registration or forwarding with secret-safe rejection metadata.
- [x] 2.3 Add agent-shell integration coverage proving inbound untrimmed display names are treated as unsafe raw input.
- [x] 2.4 Add agent-shell integration coverage proving public `send()` rejects untrimmed `hello` display names before socket write and local `sent` events.

## 3. Specs, Verification, and Review

- [x] 3.1 Sync main specs with the display-name metadata requirements.
- [x] 3.2 Run focused protocol, relay, agent-shell args, and agent-shell runtime tests.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.4 Perform a security review of protocol metadata validation, relay rejection, agent-shell local event/log exposure, and OpenSpec impact.
