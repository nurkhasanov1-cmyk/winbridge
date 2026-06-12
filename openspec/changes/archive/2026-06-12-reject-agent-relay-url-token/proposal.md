## Why

The agent shell supports a dedicated `--token` option and runtime `token` field for relay shared-token access. If a caller embeds `token` directly in `--relay` or `relayUrl`, token handling becomes split across two inputs and creates a larger accidental logging/configuration surface.

## What Changes

- Reject agent-shell relay URLs that include a `token` query parameter.
- Keep token-protected relay support through the existing dedicated `--token` option/runtime field.
- Add focused CLI and runtime validation coverage.
- Update security documentation to make the dedicated token path explicit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-shell-consent-workflow`: relay token values must be supplied through the dedicated token option/field, not embedded in relay URLs.

## Impact

- Affected code: agent-shell CLI argument parsing, managed runtime option validation, focused tests, docs, OpenSpec artifacts.
- Affected systems: local development agent-shell relay connection configuration.
- Safety impact: reduces accidental token exposure and keeps token handling centralized. This does not add capture, input, clipboard sync, file transfer, diagnostics export, installer, startup, service, credential access, or privilege behavior.
