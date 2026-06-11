## 1. Heartbeat Config Validation

- [x] 1.1 Add relay heartbeat tests for exact valid env values, omitted defaults, disabled heartbeat, malformed env values, and timer-unsafe env values.
- [x] 1.2 Add relay heartbeat tests for unsafe injected runtime heartbeat settings.
- [x] 1.3 Implement exact positive bounded integer parsing for heartbeat interval and timeout env values and injected settings.
- [x] 1.4 Update README and security documentation to describe bounded exact heartbeat timer values.

## 2. Verification

- [x] 2.1 Run focused relay heartbeat tests.
- [x] 2.2 Run `npm run check`.
- [x] 2.3 Run `npm test`.
- [x] 2.4 Run `npm run build`.
- [x] 2.5 Run `npm run openspec:validate`.
- [x] 2.6 Run security review for relay heartbeat configuration changes.
- [x] 2.7 Archive the OpenSpec change after implementation and verification are complete.
