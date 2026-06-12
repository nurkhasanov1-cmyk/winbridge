## 1. Implementation

- [x] 1.1 Add an inbound same-role `hello` guard before local `received` events and presence workflow handling.
- [x] 1.2 Keep ignored same-role `hello` diagnostics secret-safe.
- [x] 1.3 Update the main `agent-shell-consent-workflow` spec with the same-role `hello` boundary.

## 2. Verification

- [x] 2.1 Add focused integration coverage proving same-role inbound `hello` does not emit `received`, does not send local `hello`, and does not unlock public peer sends.
- [x] 2.2 Preserve coverage that opposite-role inbound `hello` still triggers exactly one local `hello`.
- [x] 2.3 Run focused agent-shell runtime integration tests for inbound `hello` role binding.
- [x] 2.4 Run security review for the presence/send-path diff.
- [x] 2.5 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 2.6 Validate and archive the completed OpenSpec change.
