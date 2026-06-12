## 1. Relay Token Boundary

- [x] 1.1 Reject token query parameters when the relay shared token is not configured, before peer join or registration.
- [x] 1.2 Emit a secret-safe denied token audit record for unconfigured token presentation.

## 2. Tests and Documentation

- [x] 2.1 Add relay integration coverage for one and duplicate unconfigured token query parameters, including bounded close reasons and audit redaction.
- [x] 2.2 Update README and security/architecture docs to document fail-closed unconfigured token handling.

## 3. Verification

- [x] 3.1 Run focused relay tests for shared-token behavior.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Complete security review for relay token and audit changes.
