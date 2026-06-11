## Why

Protocol schemas now reject malformed machine identifiers, but the development agent shell still accepts malformed `--session`, `--peer`, and `--device` arguments and only fails later when protocol messages are encoded or relayed. The CLI should fail before starting the runtime, matching existing fail-closed argument validation.

## What Changes

- Validate agent-shell `--session`, `--peer`, and `--device` values with the shared protocol identifier schemas during argument parsing.
- Preserve existing defaults and documented examples such as `demo`, `host-42`, `viewer-42`, and `dev_viewer_42`.
- Return the existing bounded usage error for malformed identifier arguments.
- Non-goals: no new remote actions, no screen capture, no input injection, no relay protocol changes, no production identity provider.

## Capabilities

### New Capabilities

### Modified Capabilities
- `agent-shell-consent-workflow`: CLI argument validation rejects malformed protocol identifier arguments before runtime startup.

## Impact

- Affected code: `apps/agent-shell/src/args.ts`, `apps/agent-shell/src/args.test.ts`, README/docs if usage notes need clarification, and OpenSpec artifacts.
- Safety impact: improves fail-closed CLI behavior for session/device identity inputs; does not touch capture, input, installer, startup, services, privilege elevation, or production auth. It touches local workflow/auth metadata validation, so focused tests and standard verification are required.
