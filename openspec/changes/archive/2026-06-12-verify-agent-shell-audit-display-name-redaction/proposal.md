## Why

The agent-shell audit spec already requires persisted workflow audit details to exclude raw display names and private lifecycle reasons, but current regression coverage mostly checks pairing codes and private reasons. Explicit coverage for private host/viewer display names prevents future workflow audit changes from accidentally persisting user-identifying UI labels.

## What Changes

- Add focused agent-shell integration coverage using private host and viewer display names while persisting host workflow audit records.
- Verify persisted workflow audit records keep safe actor/session/action/outcome metadata but do not include raw display names, raw private lifecycle reasons, pairing codes, signal payloads, or protocol payloads.
- Keep runtime behavior unchanged unless the test exposes a safety bug.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-shell-consent-workflow`: Clarify that host workflow audit file persistence must be tested with private display-name and lifecycle-reason markers.

## Impact

- Affected code: focused agent-shell runtime integration tests and OpenSpec artifacts.
- Affected systems: local development workflow audit persistence.
- Safety impact: strengthens regression protection for audit/log hygiene. This does not add capture, input, clipboard sync, file transfer, diagnostics export, installer, startup, service, token storage, or privilege elevation behavior.
