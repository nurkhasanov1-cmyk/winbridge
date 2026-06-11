## Why

The relay now rejects blank configured shared tokens, but the agent shell still accepts whitespace-only `--token` values and only fails later through relay authentication or development-mode ambiguity. Token configuration should fail fast at the CLI boundary so a configured-but-blank access token is never presented over a relay URL.

## What Changes

- Reject empty or whitespace-only agent shell `--token` values during argument parsing.
- Preserve omitted `--token` behavior as no development relay token.
- Preserve valid non-blank tokens exactly instead of trimming token material.
- Document that agent `--token` is optional development shared-token material and must be non-blank when supplied.
- Non-goals: no production authentication, no account login, no token lifecycle, no native Windows capture/input, no installer/startup/service behavior, and no permission or consent semantic changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-shell-consent-workflow`: CLI validation rejects blank access token values before starting the runtime.

## Impact

- Affected code: `apps/agent-shell/src/args.ts`, agent shell argument tests, README/security docs, and OpenSpec specs.
- Affected systems: development agent shell CLI and relay shared-token presentation.
- Safety impact: removes ambiguous configured token handling and prevents blank token material from being placed in relay connection URLs.
- This change touches token configuration and requires security review. It does not touch capture, input, installer, startup, services, logs, or privilege elevation.
