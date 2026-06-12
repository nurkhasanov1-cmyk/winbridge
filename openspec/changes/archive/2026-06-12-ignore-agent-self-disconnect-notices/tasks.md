## 1. Implementation

- [x] 1.1 Add an inbound self-disconnect guard in the agent shell runtime before local `received` events and remote-disconnected state handling.
- [x] 1.2 Keep ignored self-disconnect diagnostics redacted to summary metadata only.
- [x] 1.3 Update docs and the main `agent-shell-consent-workflow` spec with the self-disconnect boundary.

## 2. Verification

- [x] 2.1 Add focused integration coverage for self-referential `peer-disconnected` notices.
- [x] 2.2 Run the focused agent-shell runtime integration test.
- [x] 2.3 Run security review for the disconnect-state/logging diff.
- [x] 2.4 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 2.5 Validate and archive the completed OpenSpec change.
