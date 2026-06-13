## 1. Audit Schema

- [x] 1.1 Add shared audit actor validation that rejects `deviceId` on `system` and `relay` actors while preserving host/viewer support.
- [x] 1.2 Add focused protocol tests for allowed host/viewer `deviceId` and rejected system/relay `deviceId`.

## 2. Verification

- [x] 2.1 Run the focused protocol audit tests.
- [x] 2.2 Run `npm run check`.
- [x] 2.3 Run `npm test`.
- [x] 2.4 Run `npm run build`.
- [x] 2.5 Run `npm run openspec:validate`.
- [x] 2.6 Complete security review for the audit/log validation change.
