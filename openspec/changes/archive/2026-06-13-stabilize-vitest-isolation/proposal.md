## Why

Local `npm test` still intermittently fails on Windows with Vitest/Tinypool
`ERR_IPC_CHANNEL_CLOSED` after a test file's assertions pass. The current runner
uses process workers, but its required `--no-isolate` flag leaves the worker
teardown path unstable enough to block reliable verification.

## What Changes

- Keep serial per-file Vitest invocations and the `forks` process pool.
- Stop requiring `--no-isolate` for each invocation; let Vitest keep its default
  file isolation inside the single-file process-pool run.
- Update the local test-runner contract to require process-based serial
  execution without the unstable no-isolation override.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-orchestration`: revise the stable local test runner requirement to keep
  process-based serial execution while allowing Vitest's default isolation.

## Impact

- Affected workflow script: `scripts/run-tests.mjs`.
- Affected OpenSpec capability: `agent-orchestration`.
- Safety impact: no remote assistance behavior changes; this does not touch
  capture, input, authentication, authorization, relay routing, installer,
  startup, services, tokens, logs, or privilege elevation.
- Non-goals: no test retry masking, no skipped test files, no change to supported
  Node.js versions, and no remote capability implementation.
