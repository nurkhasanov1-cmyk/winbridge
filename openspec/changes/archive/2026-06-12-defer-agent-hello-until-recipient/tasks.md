# Tasks

## 1. Agent Hello Workflow

- [x] 1.1 Defer the initial agent-shell `hello` until `relay-ready.roomSize >= 2` or a peer `hello` is received.
- [x] 1.2 Ensure each runtime sends `hello` at most once and suppresses late `hello` sends after peer disconnect.

## 2. Tests and Documentation

- [x] 2.1 Add focused integration coverage showing host-only startup sends `join-session` but not `hello` or recipient-less relay errors.
- [x] 2.2 Add focused integration coverage showing paired host/viewer runtimes exchange `hello` once and the viewer authorization request still reaches the host.
- [x] 2.3 Update architecture, security, and main specs to describe recipient-aware `hello` ordering.

## 3. Verification and Review

- [x] 3.1 Run focused agent-shell tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Complete a security review for the relay-adjacent consent workflow change.
- [x] 3.4 Archive the completed OpenSpec change.
