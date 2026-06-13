# agent-orchestration Specification

## Purpose
Defines Codex/OpenSpec orchestration, subagent review gates, and repository workflow expectations for safe development.
## Requirements
### Requirement: OpenSpec-first workflow
The project SHALL use OpenSpec proposals, specs, design notes, and tasks for behavior changes that affect remote assistance, security, networking, native Windows APIs, installer behavior, or user-visible workflows.

#### Scenario: New remote capability requested
- **WHEN** a task adds or changes a remote capability
- **THEN** Codex creates or updates an OpenSpec change before implementation

### Requirement: Scoped subagent delegation
Codex SHALL delegate to subagents only for explicit, bounded work with disjoint file ownership, documented safety invariants, and a clear handoff output.

#### Scenario: Worker receives implementation task
- **WHEN** a worker subagent is assigned implementation work
- **THEN** the prompt names allowed files or modules, out-of-scope areas, acceptance criteria, tests, and stop conditions

### Requirement: Security review gate
Changes touching capture, input, authentication, authorization, relay routing, tokens, logging, installer behavior, startup behavior, privilege elevation, or background services SHALL receive an explicit security review before release.

#### Scenario: Pull request touches input handling
- **WHEN** a pull request modifies remote input code
- **THEN** the reviewer verifies authenticated, authorized, active, visible-session gating and tests denial/revocation paths

### Requirement: Handoff traceability
Each delegated result SHALL report assumptions, edited paths or inspected paths, verification performed, and any OpenSpec impact.

#### Scenario: Subagent completes work
- **WHEN** a subagent returns a result
- **THEN** the main thread records how the result was used or why it was rejected

### Requirement: GitHub CI verifies supported Node runtimes
The repository SHALL run GitHub Actions verification on Windows for both the minimum supported Node.js runtime declared by `package.json` and the current stable Node.js runtime used by the project workflow.

#### Scenario: CI verifies minimum Node support
- **WHEN** code is pushed to `main`, `master`, or `codex/**`, or a pull request targets `main` or `master`
- **THEN** GitHub Actions runs install, typecheck, tests, build, and strict OpenSpec validation on Node `20.19.0`

#### Scenario: CI verifies current Node support
- **WHEN** code is pushed to `main`, `master`, or `codex/**`, or a pull request targets `main` or `master`
- **THEN** GitHub Actions runs install, typecheck, tests, build, and strict OpenSpec validation on Node `24`

### Requirement: GitHub CI uses least-privilege bounded jobs
The repository SHALL run verification-only GitHub Actions jobs with explicit read-only repository contents permissions and an explicit job timeout. These workflow hardening controls MUST NOT change the verified Node runtime matrix or skip install, typecheck, tests, build, or strict OpenSpec validation.

#### Scenario: CI declares read-only repository permissions
- **WHEN** GitHub Actions runs the verification workflow
- **THEN** the workflow requests only read access to repository contents
- **AND** the workflow does not request write-capable repository permissions

#### Scenario: CI jobs are timeout bounded
- **WHEN** GitHub Actions runs each Windows Node matrix verification job
- **THEN** the job has an explicit timeout
- **AND** the job still runs install, typecheck, tests, build, and strict OpenSpec validation

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

### Requirement: Safe GitHub backlog sequencing
The repository SHALL keep GitHub setup and backlog guidance aligned with the current bootstrap safety scope. Suggested initial issues MUST prioritize identity/pairing, consent visibility, revocation, auditability, relay/protocol hardening, documentation gates, and CI/OpenSpec verification before native capture, input, installer, startup, service, or privilege work. Backlog guidance that mentions high-risk native or sensitive areas MUST state that those items require explicit OpenSpec design and security review before implementation.

#### Scenario: Initial backlog avoids premature native implementation
- **WHEN** maintainers use the repository GitHub setup guide to seed initial issues
- **THEN** the initial issue list prioritizes bootstrap-safe work before Windows capture, input, installer, startup, service, or privilege implementation

#### Scenario: Native work remains gated
- **WHEN** repository documentation mentions future Windows capture, input, native APIs, installer, startup, service, or privilege work
- **THEN** it states that implementation requires a future OpenSpec change and security review before coding

#### Scenario: Backlog guidance preserves safety boundaries
- **WHEN** suggested issues are reviewed for the current bootstrap scope
- **THEN** they MUST NOT imply hidden sessions, unattended access, stealth installation, unauthorized persistence, credential theft, keylogging, AV/EDR evasion, Windows prompt bypass, hidden capture, hidden input, or remote actions without explicit host consent
