# Tasks

## 1. Authorization Validation

- [x] 1.1 Reject pending and approved authorization records with `visibleToHost: true`.
- [x] 1.2 Reject pending and approved `session-authorization-state` messages with `visibleToHost: true`.
- [x] 1.3 Preserve active/paused visibility requirements and terminal fail-closed behavior.

## 2. Tests and Documentation

- [x] 2.1 Add focused authorization state-machine tests for pre-active visibility rejection.
- [x] 2.2 Add focused protocol message tests for pre-active visibility rejection.
- [x] 2.3 Update session authorization specs and security docs for pre-active visibility semantics.

## 3. Verification and Review

- [x] 3.1 Run focused authorization and protocol message tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Complete security review for authorization visibility invariants.
- [x] 3.4 Archive the completed OpenSpec change.
