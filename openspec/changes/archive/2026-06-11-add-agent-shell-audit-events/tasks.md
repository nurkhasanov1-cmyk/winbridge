## 1. Agent Shell Audit Events

- [x] 1.1 Add a host-side helper for sending secret-safe development audit-event messages.
- [x] 1.2 Emit audit events for host approval, denial, visible activation, and permission revocation simulation.

## 2. Tests and Documentation

- [x] 2.1 Add integration tests for approval, denial, activation, revocation audit events, and secret-safe details.
- [x] 2.2 Document development audit-event scope and non-persistence.

## 3. Review and Verification

- [x] 3.1 Perform security review for audit/consent workflow changes, confirming no capture, input, hidden session, persistence, credential access, keylogging, token/payload logging, or Windows prompt bypass was introduced.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Archive the completed OpenSpec change after implementation and verification.
