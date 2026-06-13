## 1. Viewer Audit Event Authority

- [x] 1.1 Add an inbound viewer `audit-event` guard that requires `actorPeerId` to match the observed opposite-role host before local `received` event emission.
- [x] 1.2 Add integration tests for unobserved-host and mismatched-host audit events remaining secret-safe and non-authorizing.
- [x] 1.3 Verify valid observed-host audit-event flows still emit redacted received events.

## 2. Verification

- [x] 2.1 Run focused agent-shell audit-event authority tests.
- [x] 2.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 2.3 Complete security review for the agent-shell auth/audit workflow diff.

## 3. OpenSpec Completion

- [x] 3.1 Sync the accepted requirement into `openspec/specs/agent-shell-consent-workflow/spec.md`.
- [x] 3.2 Validate and archive the completed OpenSpec change.
