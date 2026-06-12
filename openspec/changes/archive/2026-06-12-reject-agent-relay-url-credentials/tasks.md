## 1. Implementation

- [x] 1.1 Reject username/password userinfo credentials in agent-shell CLI `--relay` parsing.
- [x] 1.2 Reject username/password userinfo credentials in managed agent-shell runtime `relayUrl` validation.
- [x] 1.3 Keep credential-free relay URLs and dedicated `--token` / runtime `token` support unchanged.
- [x] 1.4 Update README and security/architecture documentation for credential-free relay URLs.

## 2. Verification

- [x] 2.1 Add focused CLI and runtime validation tests for relay URLs with userinfo credentials.
- [x] 2.2 Run focused agent-shell argument and runtime tests.
- [x] 2.3 Complete security review for the agent-shell credential URL validation diff.
- [x] 2.4 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 2.5 Sync the completed OpenSpec delta into main specs and archive the change.
