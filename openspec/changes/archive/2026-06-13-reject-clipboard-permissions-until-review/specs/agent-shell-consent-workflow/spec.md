## ADDED Requirements

### Requirement: Agent-shell rejects clipboard permission scopes

The agent shell SHALL reject clipboard permissions, including `clipboard:read`
and `clipboard:write`, in CLI requested permissions, CLI host grant scopes, CLI
revoke permission options, direct runtime requested permissions, direct runtime
host grant scopes, and direct runtime revoke permission options before opening a
relay connection, sending protocol messages, activating host visibility, or
emitting trusted workflow events.

#### Scenario: CLI requests clipboard permission

- **WHEN** the agent-shell CLI is started with `--request clipboard:read` or `--request clipboard:write`
- **THEN** argument parsing fails before the runtime starts or connects to a relay
- **AND** usage handling MUST NOT approve authorization, activate host visibility, expose clipboard contents, start capture, send input, or bypass consent workflows

#### Scenario: CLI host grant names clipboard permission

- **WHEN** the agent-shell CLI is started with `--grant clipboard:read` or `--grant clipboard:write`
- **THEN** argument parsing fails before the runtime starts or connects to a relay

#### Scenario: CLI revoke names clipboard permission

- **WHEN** the agent-shell CLI is started with `--revoke-permission clipboard:read` or `--revoke-permission clipboard:write`
- **THEN** argument parsing fails before the runtime starts or connects to a relay

#### Scenario: Runtime options name clipboard permission

- **WHEN** caller code creates a managed runtime with clipboard permissions in requested permissions, host grant scope, or revoke permission
- **THEN** runtime creation fails before opening a relay connection or sending any protocol message
- **AND** thrown errors, runtime events, and logs MUST NOT expose clipboard contents
