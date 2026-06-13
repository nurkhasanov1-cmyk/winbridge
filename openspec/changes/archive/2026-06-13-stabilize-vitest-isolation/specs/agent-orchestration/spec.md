## MODIFIED Requirements

### Requirement: Stable local test runner
The repository SHALL run local `npm test` through serial per-file Vitest invocations using a process-based worker pool. The runner MUST discover `.test.ts` files under `apps/` and `packages/`, invoke each discovered file once, include `--pool forks`, `--maxWorkers 1`, `--minWorkers 1`, and `--no-file-parallelism` for each invocation, and MUST NOT pass `--no-isolate`.

#### Scenario: Runtime integration tests avoid thread worker IPC
- **WHEN** `npm test` runs in a Windows-compatible local development environment
- **THEN** `apps/agent-shell/src/runtime.integration.test.ts` and `apps/relay/src/server.integration.test.ts` are executed with the process-based Vitest worker pool
- **AND** the runner does not special-case either runtime integration test onto the thread-based worker pool

#### Scenario: Test discovery remains complete
- **WHEN** the test runner enumerates tests
- **THEN** it discovers `.test.ts` files under both `apps/` and `packages/`
- **AND** it invokes each discovered test file once with serial execution flags

#### Scenario: Fork isolation remains enabled
- **WHEN** the test runner starts Vitest for a discovered test file
- **THEN** the invocation omits `--no-isolate`
- **AND** Vitest keeps its default forks isolation while still running only that test file
