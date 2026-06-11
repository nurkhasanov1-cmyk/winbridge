## 1. Schema Hardening

- [x] 1.1 Add schema-level validation for duplicate permissions.
- [x] 1.2 Enforce non-empty permissions for pending, approved, active, and paused authorization records while allowing revoked records to be empty.
- [x] 1.3 Enforce host visibility for active and paused authorization records.
- [x] 1.4 Add and enforce lifecycle timestamps for denied, approved, active, paused, revoked, terminated, and expired records.
- [x] 1.5 Enforce auditable resume history when active records include prior pause state.

## 2. Tests

- [x] 2.1 Add direct schema parse tests for duplicate permissions, empty grant-bearing states, and empty revoked records.
- [x] 2.2 Add direct schema parse tests for active/paused visibility and lifecycle timestamp requirements.
- [x] 2.3 Add direct schema parse tests for paused/resumed lifecycle history consistency.
- [x] 2.4 Update state-machine tests for any new timestamp fields.

## 3. Review And Verification

- [x] 3.1 Run security review for authorization schema hardening.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Archive the completed OpenSpec change and verify no active changes remain.
