## Why

Agent-shell session ids and peer ids are protocol metadata sent before consent workflows can complete. Today CLI and direct runtime validation enforce identifier syntax but still allow syntactically valid token-, credential-, cookie-, key-, or auth-looking values, which can carry secret-shaped metadata into join/session handling.

## What Changes

- Reject secret-bearing agent-shell `--session` and `--peer` values during CLI parsing before runtime construction.
- Reject secret-bearing direct runtime `sessionId` and `peerId` values before relay connection or protocol sends.
- Keep generated defaults and ordinary custom ids valid.
- Reuse the existing protocol secret-bearing identifier marker helper so this boundary stays aligned with audit redaction semantics.
- Safety impact: fail-closed metadata hygiene only. This does not add or change capture, input, clipboard, file transfer, diagnostics export, relay routing, installer behavior, startup behavior, services, privilege elevation, token storage, or log persistence.
- Non-goals: changing shared protocol identifier schemas, adding production account identity, changing relay pairing semantics, or introducing any native Windows remote control behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: agent-shell CLI and managed runtime session/peer identifier validation reject secret-bearing protocol identifier metadata before relay startup.

## Impact

- Code: `apps/agent-shell/src/args.ts`, `apps/agent-shell/src/runtime.ts`.
- Tests: focused agent-shell CLI parsing and managed runtime validation tests.
- Docs/specs: OpenSpec `agent-shell-consent-workflow` delta and concise docs for the session/peer identifier metadata boundary.
- APIs/dependencies: no new dependencies and no public protocol schema change.
