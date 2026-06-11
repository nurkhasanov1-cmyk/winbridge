## ADDED Requirements

### Requirement: Non-blank audit file paths
The system SHALL reject configured file audit paths that are empty or whitespace-only before writing audit records or falling back to non-file audit behavior.

#### Scenario: File sink path is blank
- **WHEN** a file audit sink is constructed with an empty or whitespace-only path
- **THEN** construction fails before any audit record is written

#### Scenario: Relay audit environment path is blank
- **WHEN** the relay is configured with an empty or whitespace-only `WINBRIDGE_RELAY_AUDIT_LOG_PATH`
- **THEN** relay startup fails before selecting console audit fallback or accepting peer connections

#### Scenario: Agent audit environment path is blank
- **WHEN** the agent shell is configured with an empty or whitespace-only `WINBRIDGE_AGENT_AUDIT_LOG_PATH`
- **THEN** argument parsing fails before starting the runtime or connecting to the relay

#### Scenario: Agent audit CLI path is blank
- **WHEN** the agent shell is started with an empty or whitespace-only `--audit-log` value
- **THEN** argument parsing fails before starting the runtime or connecting to the relay
