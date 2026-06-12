## 1. Inbound Runtime Gate

- [x] 1.1 Add an inbound filter for legacy `host-consent-decision` before local `received` event emission.
- [x] 1.2 Preserve `session-authorization-decision`/state authorization binding and legacy `host-consent-required` request behavior.

## 2. Verification Coverage

- [x] 2.1 Add integration coverage proving inbound legacy `host-consent-decision` is ignored before `received` events and workflow logs.
- [x] 2.2 Verify the ignored legacy decision does not authorize viewer `signal` sends and does not leak peer, reason, grant, or raw-token markers.
- [x] 2.3 Sync main agent-shell consent workflow spec and docs.

## 3. Review And Gates

- [x] 3.1 Run focused agent-shell legacy inbound decision tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Perform security review for auth/log handling and archive the completed OpenSpec change.
