## 1. Shared Helper

- [x] 1.1 Add shared protocol permission list validation helpers next to the existing permission vocabulary.
- [x] 1.2 Update session grant, authorization record/transition, and authorization protocol envelope code to use the shared helpers while preserving current permission vocabulary and output shapes.

## 2. Regression Coverage

- [x] 2.1 Add focused tests proving shared permission list validation rejects duplicates, oversized lists, unavailable permissions, high-risk permission-shaped strings, and preserves safe unique scopes across representative callers.
- [x] 2.2 Run focused protocol tests and protocol typecheck.

## 3. Review and Validation

- [x] 3.1 Perform security review for auth/protocol scope impact and confirm no capture, input runtime behavior, relay routing/runtime, installer, startup, service, token, log sink, or privilege behavior changed.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Archive the completed OpenSpec change after implementation and verification.
