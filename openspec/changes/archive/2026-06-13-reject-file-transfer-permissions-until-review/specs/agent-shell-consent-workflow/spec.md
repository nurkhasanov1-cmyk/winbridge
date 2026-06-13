## ADDED Requirements

### Requirement: Agent-shell rejects file-transfer permission scope

The agent shell SHALL reject `file-transfer` in CLI requested permissions, CLI
host grant scopes, CLI revoke permission options, direct runtime requested
permissions, direct runtime host grant scopes, direct runtime revoke permission
options, and interactive host control revoke commands before opening a relay
connection, sending protocol messages, activating host visibility, invoking
managed host controls, or emitting trusted workflow events.

#### Scenario: CLI requests file-transfer permission

- **WHEN** the agent-shell CLI is started with `--request file-transfer`
- **THEN** argument parsing fails before the runtime starts or connects to a relay
- **AND** usage handling MUST NOT approve authorization, activate host visibility, expose file contents, transfer files, start capture, send input, or bypass consent workflows

#### Scenario: CLI host grant names file-transfer permission

- **WHEN** the agent-shell CLI is started with `--grant file-transfer`
- **THEN** argument parsing fails before the runtime starts or connects to a relay

#### Scenario: CLI revoke names file-transfer permission

- **WHEN** the agent-shell CLI is started with `--revoke-permission file-transfer`
- **THEN** argument parsing fails before the runtime starts or connects to a relay

#### Scenario: Runtime options name file-transfer permission

- **WHEN** caller code creates a managed runtime with `file-transfer` in requested permissions, host grant scope, or revoke permission
- **THEN** runtime creation fails before opening a relay connection or sending any protocol message
- **AND** thrown errors, runtime events, and logs MUST NOT expose file contents or file-transfer payloads

#### Scenario: Host control prompt names file-transfer permission

- **WHEN** the interactive host control prompt receives `revoke file-transfer`
- **THEN** command parsing rejects the line before invoking managed host controls
- **AND** output MUST NOT echo the raw command line or imply a file-transfer permission exists
