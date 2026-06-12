## Why

The agent shell already rejects relay URLs with `token` query parameters and uses a dedicated token field for shared-token access. WebSocket URLs can also carry userinfo credentials (`ws://user:pass@host`), which creates another accidental credential-in-URL surface and may be interpreted by client libraries as authentication metadata.

## What Changes

- Reject agent-shell relay URLs that include username or password/userinfo credentials.
- Apply the rejection in both CLI `--relay` parsing and managed runtime `relayUrl` validation.
- Keep dedicated `--token` / runtime `token` support unchanged.
- Update docs and OpenSpec to document credential-free relay URLs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-shell-consent-workflow`: relay URLs must not include embedded credentials/userinfo.

## Impact

- Affected code: agent-shell CLI argument parsing, managed runtime option validation, focused tests, docs, OpenSpec artifacts.
- Affected systems: local development agent-shell relay connection configuration.
- Safety impact: reduces accidental credential exposure and keeps relay credential material out of URL surfaces. This does not add capture, input, clipboard sync, file transfer, diagnostics export, installer, startup, service, credential collection, or privilege behavior.
