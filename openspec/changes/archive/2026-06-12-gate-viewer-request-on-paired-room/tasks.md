# Tasks

## 1. Viewer Authorization Request Gate

- [x] 1.1 Gate viewer `session-authorization-request` sending on `relay-ready.roomSize >= 2`.
- [x] 1.2 Preserve the explicit requested-permission gate and existing paired host/viewer workflow.

## 2. Tests and Documentation

- [x] 2.1 Add focused coverage that a viewer receiving `relay-ready.roomSize = 1` does not send an authorization request.
- [x] 2.2 Update architecture, security, and main specs to document paired-room authorization request ordering.

## 3. Verification and Review

- [x] 3.1 Run focused agent-shell tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Complete security review for the consent workflow gate.
- [x] 3.4 Archive the completed OpenSpec change.
