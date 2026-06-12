## 1. Implementation

- [x] 1.1 Add bounded ASCII-control-free development shared-token validation for relay environment and direct runtime config.
- [x] 1.2 Add bounded ASCII-control-free token validation for agent-shell CLI and direct runtime config.
- [x] 1.3 Preserve omitted-token development mode and exact valid padded token semantics.
- [x] 1.4 Update README, architecture, security, and main OpenSpec specs for token bounds.

## 2. Verification

- [x] 2.1 Add focused relay tests for blank, non-string, control-character, oversized, omitted, and valid padded shared tokens.
- [x] 2.2 Add focused agent-shell CLI/runtime tests for malformed and valid token values.
- [x] 2.3 Run focused relay and agent-shell tests.
- [x] 2.4 Complete security review for token, relay, and local event/log safety.
- [x] 2.5 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 2.6 Sync the completed OpenSpec delta into main specs and archive the change.
