## Why

WinBridge already has CI, PR templates, and security boundaries, but release readiness is still scattered across roadmap and security docs. A dedicated release checklist and privacy notice make consent, visibility, audit, data handling, and abuse-prevention expectations explicit before any build is shipped or promoted.

## What Changes

- Add a release readiness checklist document for maintainers.
- Add a bootstrap privacy notice that documents current data handling, non-goals, and pre-production limitations.
- Link these documents from README, GitHub setup, and the PR template.
- Stabilize the local `npm test` runner by using process-based Vitest workers for all serial test-file invocations.
- Add an OpenSpec requirement that release candidates must include current release/privacy documentation before publication.
- Non-goals: no runtime behavior, protocol, relay, authentication, token, audit persistence, installer, startup, service, native Windows API, capture, input, clipboard, file-transfer, diagnostics, or privilege-elevation changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-orchestration`: add a release documentation gate for release checklist and privacy/data-handling documentation.

## Impact

- Affected docs: `docs/release-checklist.md`, `docs/privacy-notice.md`, README, GitHub setup, and PR template.
- Affected workflow scripts: `scripts/run-tests.mjs`.
- Affected specs: `openspec/specs/agent-orchestration/spec.md`.
- APIs/dependencies: none.
