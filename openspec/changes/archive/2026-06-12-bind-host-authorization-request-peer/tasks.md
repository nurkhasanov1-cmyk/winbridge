## 1. Implementation

- [x] 1.1 Track accepted opposite-role peer identity in connection-scoped agent shell state.
- [x] 1.2 Ignore host-side authorization requests whose `viewerPeerId` is not the observed viewer peer before local `received` events and workflow output.
- [x] 1.3 Keep ignored mismatched request diagnostics secret-safe.
- [x] 1.4 Update the main `agent-shell-consent-workflow` spec with the host request peer binding.

## 2. Verification

- [x] 2.1 Add focused integration coverage proving unbound or mismatched host authorization requests emit no `received`, decision, state, or audit events.
- [x] 2.2 Preserve coverage that a bound viewer request still reaches normal host decision workflow.
- [x] 2.3 Run focused agent-shell runtime integration tests for host request peer binding.
- [x] 2.4 Run security review for the host authorization workflow diff.
- [x] 2.5 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 2.6 Validate and archive the completed OpenSpec change.
