## Why

The agent shell CLI validates `--host-decision`, but the managed runtime can also be constructed directly by tests or embedding code. A malformed runtime `hostDecision` value must not fall through to the approval path, because host authorization is a consent gate.

## What Changes

- Validate runtime `hostDecision` values before the agent shell starts a relay connection or handles authorization requests.
- Treat only `none`, `approve`, and `deny` as valid runtime host decisions.
- Keep the current CLI behavior and safe defaults unchanged.
- Add focused regression coverage for malformed runtime host decisions.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: the explicit host decision requirement now includes fail-closed runtime validation for malformed host decision values.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`.
- Affected tests: agent-shell runtime consent workflow tests.
- Affected docs/specs: OpenSpec agent-shell consent workflow and development security documentation.
- Safety impact: strengthens the host consent gate by preventing malformed runtime configuration from becoming implicit approval.
- Touches: authorization/consent workflow. Does not touch capture, input, relay behavior, installer, startup, services, tokens, logs, or privilege elevation.
- Non-goals: no native screen capture, no remote input, no hidden sessions, no credential access, no persistence, and no Windows security prompt bypass.
