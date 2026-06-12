## Why

Development relay shared tokens are currently rejected only when blank. Since these values can be injected into relay runtime configuration and added to agent-shell relay URLs, malformed non-string, control-character, or oversized token values should fail before connection setup instead of reaching URL construction or relay startup.

## What Changes

- Bound development shared-token values to non-blank strings with no ASCII control characters and a maximum UTF-8 byte length.
- Reject malformed relay `sharedToken` runtime values and `WINBRIDGE_RELAY_SHARED_TOKEN` environment values before accepting peer connections.
- Reject malformed agent-shell runtime `token` values and CLI `--token` values before opening a relay connection or adding a token query parameter.
- Preserve omitted-token development mode and existing valid padded token behavior.
- Update docs/specs to clarify that development shared tokens remain local/private development gates, not production authorization.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-broker`: development relay shared-token configuration rejects malformed token values before peer joins.
- `relay-runtime`: relay runtime tests cover bounded shared-token configuration failures before peer acceptance.
- `agent-shell-consent-workflow`: CLI/runtime token values are rejected when malformed before relay connection setup.

## Impact

- Affected code: `apps/relay/src/server.ts`, `apps/agent-shell/src/args.ts`, and `apps/agent-shell/src/runtime.ts`.
- Affected tests: relay integration token config tests and agent-shell CLI/runtime validation tests.
- Affected docs/specs: README, architecture/security docs, and OpenSpec specs listed above.
- Safety impact: tighter fail-closed handling for development access-token configuration. This touches tokens, relay, logs/event safety by preventing malformed token values from entering connection setup. It does not add capture, input, clipboard sync, file transfer, diagnostics export, installer, startup, service, credential collection, persistence, privilege elevation, or production authorization.
