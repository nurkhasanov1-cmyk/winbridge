## 1. Runtime Implementation

- [x] 1.1 Add host-only managed runtime `disconnect()` control with visible active or paused authorization gating.
- [x] 1.2 Refactor delayed host disconnect simulation to reuse the same local disconnect path.
- [x] 1.3 Add secret-safe `agent-shell.session.disconnected` local audit persistence while ensuring audit failures do not block indicator deactivation or WebSocket close.

## 2. Tests And Documentation

- [x] 2.1 Add focused integration tests for direct disconnect, host-only/visible-state rejection, disconnect audit persistence, audit failure close behavior, and no audit without visible activation.
- [x] 2.2 Update architecture and security docs for direct local disconnect control and local disconnect audit semantics.

## 3. Verification

- [x] 3.1 Run targeted agent-shell tests for the new disconnect control and audit behavior.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Complete security review for authorization lifecycle, visible-session, disconnect, and audit/logging surfaces.
