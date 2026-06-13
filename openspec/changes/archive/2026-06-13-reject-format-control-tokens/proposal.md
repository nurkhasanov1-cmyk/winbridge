## Why

Development shared tokens already reject blank, untrimmed, oversized, and ASCII-control values, but Unicode bidirectional and zero-width formatting controls can still make token text visually ambiguous in local configuration, scripts, and diagnostics. Rejecting these invisible or direction-changing controls keeps token handling canonical without adding any remote-assistance capability.

## What Changes

- Reject Unicode bidirectional and zero-width formatting controls in relay shared-token configuration.
- Reject the same controls in agent shell `--token` and direct runtime token values before connection setup.
- Add tests proving CLI/runtime/config rejection is fail-closed and secret-safe.
- Update README, security docs, architecture docs, and OpenSpec specs.
- Non-goals: no production identity, account auth, token issuance, capture, input, clipboard, file transfer, reconnect, installer/service/startup behavior, privilege elevation, or Windows prompt behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-broker`: development relay shared-token requirements reject Unicode bidirectional and zero-width formatting controls.
- `relay-runtime`: managed relay shared-token configuration validation rejects those controls before listener startup.
- `agent-shell-consent-workflow`: agent shell CLI/runtime relay-token validation rejects those controls before relay connection setup.

## Impact

- Affected areas: `apps/relay`, `apps/agent-shell`, tests, README, security/architecture docs, and OpenSpec specs.
- Touches token/config validation and security documentation.
- Does not touch protocol schemas, relay message forwarding rules, consent approval semantics, capture/input adapters, installer behavior, services, startup persistence, privilege elevation, or Windows security prompts.
