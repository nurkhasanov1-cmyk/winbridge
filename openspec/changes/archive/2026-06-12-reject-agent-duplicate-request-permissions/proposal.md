## Why

The development agent shell currently de-duplicates repeated `--request` permission values before sending a session authorization request. Duplicate requested permissions should fail fast so consent prompts, grant scopes, and audit metadata remain unambiguous.

## What Changes

- Reject duplicate permissions in the agent shell `--request` option during CLI parsing/runtime setup.
- Preserve existing valid comma-separated permission parsing for unique requested permission scopes.
- Keep omitted `--request` fail-closed by sending no authorization request.
- Non-goals: no new remote actions, no capture/input implementation, no host approval automation, no relay/token/auth changes, and no production UI changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-shell-consent-workflow`: CLI parsing must reject duplicate requested permissions before starting the development runtime.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`, `apps/agent-shell/src/args.test.ts`, README/security/architecture docs, and OpenSpec specs.
- Affected systems: non-native development agent shell consent workflow.
- Safety impact: prevents ambiguous permission request scopes before host consent workflow messages are produced.
- Security review: required because this touches consent workflow parsing and permission request scope.
