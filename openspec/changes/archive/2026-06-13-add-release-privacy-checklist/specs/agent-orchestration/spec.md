## ADDED Requirements

### Requirement: Release documentation gate
The repository SHALL maintain release readiness and privacy/data-handling documentation before publishing release candidates. The release documentation MUST cover consent, host visibility, host revoke/disconnect paths, authentication or authorization status, audit expectations, data handling, installer/startup/service behavior, known non-capabilities, verification commands, and security review gates. The privacy/data-handling documentation MUST NOT claim that capture, input, unattended access, production deployment, telemetry, account identity, installer, startup, service, or native Windows behavior exists until those capabilities are implemented through OpenSpec changes and reviewed.

#### Scenario: Release candidate references release documentation
- **WHEN** a release candidate is prepared
- **THEN** maintainers can find a release checklist and privacy/data-handling notice in repository documentation
- **AND** the checklist includes consent, visibility, revoke/disconnect, auth or authorization, audit, data handling, installer/startup/service, verification, and security review items

#### Scenario: Bootstrap privacy notice stays scoped
- **WHEN** the current bootstrap release documentation is reviewed
- **THEN** it states that screen capture, input injection, unattended access, production deployment, native Windows clients, installer behavior, startup persistence, services, telemetry, and production accounts are not implemented
- **AND** it documents current local development data handling without claiming production privacy guarantees

#### Scenario: Pull request template preserves release gate visibility
- **WHEN** maintainers prepare a pull request that may affect release readiness or user-facing behavior
- **THEN** the repository pull request template references the release checklist or release documentation gate
- **AND** it keeps the existing OpenSpec, safety, security review, and verification checklist expectations visible

### Requirement: Stable local test runner
The repository SHALL run local `npm test` through serial per-file Vitest invocations using a process-based worker pool. The runner MUST discover `.test.ts` files under `apps/` and `packages/`, invoke each discovered file once, and include `--pool forks`, `--maxWorkers 1`, `--minWorkers 1`, `--no-file-parallelism`, and `--no-isolate` for each invocation.

#### Scenario: Runtime integration tests avoid thread worker IPC
- **WHEN** `npm test` runs in a Windows-compatible local development environment
- **THEN** `apps/agent-shell/src/runtime.integration.test.ts` and `apps/relay/src/server.integration.test.ts` are executed with the process-based Vitest worker pool
- **AND** the runner does not special-case either runtime integration test onto the thread-based worker pool

#### Scenario: Test discovery remains complete
- **WHEN** the test runner enumerates tests
- **THEN** it discovers `.test.ts` files under both `apps/` and `packages/`
- **AND** it invokes each discovered test file once with serial execution flags
