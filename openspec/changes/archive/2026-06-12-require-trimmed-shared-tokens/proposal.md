## Why

Development shared relay tokens are authorization-adjacent credentials. Allowing leading or trailing whitespace makes configured and presented tokens visually ambiguous and easy to misconfigure.

## What Changes

- Require configured development relay shared tokens to be non-blank, bounded, ASCII-control-free, and already trimmed.
- Require agent shell `--token` and direct runtime token values to follow the same canonical trimmed rule before opening a relay connection.
- Preserve exact token comparison and existing secret-safe token denial audit behavior.
- **BREAKING**: development configurations that intentionally include leading or trailing spaces in shared tokens will be rejected.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-broker`: development shared-token values must be canonical and already trimmed before peers can use them for relay admission.
- `relay-runtime`: injected and environment relay shared-token configuration must reject untrimmed values before listener startup.
- `agent-shell-consent-workflow`: CLI and direct runtime token options must reject untrimmed values before relay connection setup.

## Impact

- Affected code: `apps/relay/src/server.ts`, `apps/relay/src/server.integration.test.ts`, `apps/agent-shell/src/args.ts`, `apps/agent-shell/src/args.test.ts`, `apps/agent-shell/src/runtime.ts`, and focused runtime tests.
- Affected docs/specs: shared-token sections in OpenSpec, README, architecture, and security model docs.
- Safety impact: touches token handling, relay startup, and connection setup only. It does not add or change screen capture, input, clipboard, file transfer, installer behavior, startup persistence, services, privilege elevation, Windows native APIs, or production authentication.
