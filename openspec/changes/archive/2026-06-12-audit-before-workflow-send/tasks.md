## 1. Runtime Ordering

- [x] 1.1 Split host workflow audit preparation from protocol `audit-event` emission.
- [x] 1.2 Prepare and persist the matching audit record before host denial, approval, active state, revoke, pause, resume, termination, and expiration workflow sends.
- [x] 1.3 Keep no-sink protocol audit-event emission behavior unchanged.

## 2. Tests

- [x] 2.1 Update audit sink failure tests so denied decisions are not sent when denial audit persistence fails.
- [x] 2.2 Add delayed lifecycle failure assertions that permission revoke/state messages are not sent when lifecycle audit persistence fails.
- [x] 2.3 Run focused agent-shell runtime tests.

## 3. Review and Verification

- [x] 3.1 Run security review for audit/log and authorization workflow ordering changes.
- [x] 3.2 Run `npm run check`.
- [x] 3.3 Run `npm test`.
- [x] 3.4 Run `npm run build`.
- [x] 3.5 Run `npm run openspec:validate`.
- [x] 3.6 Archive the completed OpenSpec change and rerun validation.
