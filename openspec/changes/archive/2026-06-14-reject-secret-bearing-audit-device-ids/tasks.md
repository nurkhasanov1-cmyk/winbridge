## 1. Audit Schema

- [x] 1.1 Update shared audit actor validation so host/viewer `deviceId` values containing secret-bearing protocol identifier metadata are rejected.
- [x] 1.2 Preserve safe participant `deviceId` acceptance and existing system/relay `deviceId` rejection.

## 2. Tests

- [x] 2.1 Add protocol audit tests for host/viewer secret-bearing `deviceId` rejection without raw value disclosure.
- [x] 2.2 Keep existing tests proving safe host/viewer `deviceId` values remain accepted and infrastructure actor `deviceId` values remain rejected.

## 3. Review and Verification

- [x] 3.1 Review audit/logging behavior for secret leakage, bounded diagnostics, and non-authorization impact.
- [x] 3.2 Run focused protocol audit tests.
- [x] 3.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.4 Sync and archive the OpenSpec change after implementation is verified.
