## 1. Runtime Indicator Surface

- [x] 1.1 Add a host indicator event type and secret-safe indicator metadata.
- [x] 1.2 Emit active, paused, updated, and inactive indicator events from host authorization lifecycle changes.
- [x] 1.3 Deactivate the indicator on local disconnect, trusted remote disconnect, and runtime stop without granting access.

## 2. Tests And Documentation

- [x] 2.1 Add integration tests for visible approval activation, withheld invisible approval, pause/resume, partial revoke, terminal revoke, disconnect, and secret-safe indicator logs/events.
- [x] 2.2 Update README, architecture, and security docs for local host indicator events.

## 3. Gates

- [x] 3.1 Run focused agent-shell tests for indicator lifecycle.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Perform security review for host-visible workflow events and archive the completed OpenSpec change.
