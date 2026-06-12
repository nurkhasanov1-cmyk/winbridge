## 1. Implementation

- [x] 1.1 Reject `token` query parameters in agent-shell CLI `--relay` parsing.
- [x] 1.2 Reject `token` query parameters in managed agent-shell runtime `relayUrl` validation.
- [x] 1.3 Keep dedicated `--token` / runtime `token` support unchanged.
- [x] 1.4 Update security documentation for the dedicated token path.

## 2. Verification

- [x] 2.1 Add focused CLI and runtime validation tests for relay URLs with `token` query parameters.
- [x] 2.2 Run focused agent-shell argument and runtime tests.
- [x] 2.3 Complete security review for the agent-shell token/URL validation diff.
- [x] 2.4 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 2.5 Sync the completed OpenSpec delta into main specs and archive the change.
