## 1. Runtime Send Gate

- [x] 1.1 Block host-originated public runtime `signal` sends unless local host authorization is active, visible, unexpired, and grants `screen:view`.
- [x] 1.2 Preserve blocked-send redaction by rejecting before socket write and local `sent` event emission.

## 2. Verification Coverage

- [x] 2.1 Add integration tests for host signal sends before authorization, after active visible authorization, after pause/revoke/termination/expiration, and after runtime restart.
- [x] 2.2 Update agent-shell consent workflow specs and docs with host signal send gate behavior.

## 3. Review And Gates

- [x] 3.1 Run focused agent-shell tests for host signal send authorization.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Perform security review for auth/log handling and archive the completed OpenSpec change.
