## ADDED Requirements

### Requirement: Agent-shell rejects diagnostics permission scope

The agent shell SHALL reject diagnostics-shaped permissions, including
`diagnostics:view`, in CLI requested permissions, CLI host grant scopes, CLI
revoke permission options, direct runtime requested permissions, direct runtime
host grant scopes, direct runtime revoke permission options, and interactive
host control revoke commands before opening a relay connection, sending protocol
messages, activating host visibility, invoking managed host controls, or
emitting trusted workflow events.

#### Scenario: CLI requests diagnostics permission

- **WHEN** the agent-shell CLI is started with `--request diagnostics:view`
- **THEN** argument parsing fails before the runtime starts or connects to a relay
- **AND** usage handling MUST NOT approve authorization, activate host visibility, expose diagnostics, start capture, send input, or bypass consent workflows

#### Scenario: CLI host grant names diagnostics permission

- **WHEN** the agent-shell CLI is started with `--grant diagnostics:view`
- **THEN** argument parsing fails before the runtime starts or connects to a relay

#### Scenario: CLI revoke names diagnostics permission

- **WHEN** the agent-shell CLI is started with `--revoke-permission diagnostics:view`
- **THEN** argument parsing fails before the runtime starts or connects to a relay

#### Scenario: Runtime options name diagnostics permission

- **WHEN** caller code creates a managed runtime with `diagnostics:view` in requested permissions, host grant scope, or revoke permission
- **THEN** runtime creation fails before opening a relay connection or sending any protocol message
- **AND** thrown errors, runtime events, and logs MUST NOT expose diagnostics contents or dumps

#### Scenario: Host control prompt names diagnostics permission

- **WHEN** the interactive host control prompt receives `revoke diagnostics:view`
- **THEN** command parsing rejects the line before invoking managed host controls
- **AND** output MUST NOT echo the raw command line or imply a diagnostics permission exists
