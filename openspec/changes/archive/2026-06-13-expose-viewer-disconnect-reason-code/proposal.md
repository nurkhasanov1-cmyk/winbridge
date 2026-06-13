## Why

Viewer-side status already fails closed after a trusted host disconnect, but it does not surface the relay-defined disconnect reason code that explains whether the host closed normally or the relay timed out liveness. Exposing the bounded code improves development UI wiring and failure diagnosis without adding reconnect, capture, input, or host control behavior.

## What Changes

- Add the last trusted remote disconnect `reasonCode` to managed viewer status snapshots after host disconnect.
- Print the optional disconnect reason code in one-shot and prompt-driven viewer status output.
- Keep status reads local and read-only: no protocol sends, audit writes, permission grants, signaling, reconnect, or lifecycle changes.
- Keep private host close reason text, peer ids, display names, signal payloads, tokens, pairing codes, and raw protocol data out of viewer status.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: Viewer status snapshots and CLI output include bounded relay-defined disconnect reason metadata after trusted remote host disconnect.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`, viewer status formatter, and focused tests.
- Affected docs/specs: `README.md`, `docs/security-model.md`, and `openspec/specs/agent-shell-consent-workflow/spec.md` via this change's delta.
- No dependency changes.
- Does not touch capture, input, auth, relay behavior, installer, startup, services, tokens, logs, or privilege elevation.
