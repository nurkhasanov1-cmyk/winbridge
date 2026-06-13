## Why

The managed runtime already exposes a safe viewer status snapshot, but the CLI has no way to exercise it during development. A viewer-side status print option gives future viewer UI work a small, testable integration point without adding remote actions or protocol authority.

## What Changes

- Add an opt-in viewer CLI option that prints a bounded local viewer status snapshot after a configured delay.
- Keep the option viewer-only and read-only; hosts must fail validation if they configure it.
- Ensure status printing does not send protocol messages, emit workflow audit events, grant permissions, start signaling, invoke host controls, or expose sensitive data.
- Document the new CLI option in README and architecture/security docs.
- No capture, input injection, clipboard sync, file transfer, diagnostics collection, installer/startup/service behavior, credential handling, relay behavior, token handling, privilege elevation, or production authorization changes are included.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: adds viewer CLI validation and output requirements for printing the existing read-only viewer status snapshot.

## Impact

- Affected code: `apps/agent-shell/src/args.ts`, `apps/agent-shell/src/index.ts`, and focused agent-shell tests.
- Affected docs: README and relevant architecture/security notes.
- Runtime/API impact: no new protocol messages and no new remote capability. The existing managed runtime `getViewerStatus()` API remains the source of truth.
- Safety impact: the feature is local viewer metadata only and must preserve consent, visibility, revocation, audit redaction, and fail-closed boundaries.
