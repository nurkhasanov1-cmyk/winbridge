## 1. OpenSpec

- [x] 1.1 Validate the new change strictly before implementation.

## 2. Implementation

- [x] 2.1 Record local disconnected state on agent-shell WebSocket close without changing restart reset semantics.
- [x] 2.2 Add integration coverage for public send after local socket close failing before socket write or `sent` event emission with secret-safe diagnostics.
- [x] 2.3 Add or confirm coverage that runtime restart clears the local socket close state.

## 3. Verification

- [x] 3.1 Run focused agent-shell integration tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Perform a security review for agent-shell lifecycle/send behavior.
- [x] 3.4 Sync specs and archive the completed OpenSpec change after implementation and validation.
