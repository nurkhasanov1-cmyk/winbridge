## MODIFIED Requirements

### Requirement: Non-blank audit file paths
The system SHALL reject configured file audit paths that are empty, whitespace-only, untrimmed, contain ASCII control characters, contain Unicode bidirectional or zero-width formatting controls, or exceed 1024 UTF-8 bytes before writing audit records or falling back to non-file audit behavior. Audit path validation failures MUST NOT include the raw configured path value in thrown errors, usage text, logs, or audit output.

#### Scenario: File sink path is blank
- **WHEN** a file audit sink is constructed with an empty or whitespace-only path
- **THEN** construction fails before any audit record is written

#### Scenario: File sink path is untrimmed
- **WHEN** a file audit sink is constructed with a path containing leading or trailing whitespace
- **THEN** construction fails before any audit record is written

#### Scenario: File sink path contains ASCII control characters
- **WHEN** a file audit sink is constructed with a path containing an ASCII control character
- **THEN** construction fails before any audit record is written
- **AND** the failure MUST NOT expose the raw path value

#### Scenario: File sink path contains format controls
- **WHEN** a file audit sink is constructed with a path containing a Unicode bidirectional or zero-width formatting control
- **THEN** construction fails before any audit record is written
- **AND** the failure MUST NOT expose the raw path value

#### Scenario: File sink path is oversized
- **WHEN** a file audit sink is constructed with a path whose UTF-8 byte length exceeds 1024 bytes
- **THEN** construction fails before any audit record is written
- **AND** the failure MUST NOT expose the raw path value

#### Scenario: Relay audit environment path is blank
- **WHEN** the relay is configured with an empty or whitespace-only `WINBRIDGE_RELAY_AUDIT_LOG_PATH`
- **THEN** relay startup fails before selecting console audit fallback or accepting peer connections

#### Scenario: Relay audit environment path is untrimmed
- **WHEN** the relay is configured with a `WINBRIDGE_RELAY_AUDIT_LOG_PATH` value containing leading or trailing whitespace
- **THEN** relay startup fails before selecting console audit fallback or accepting peer connections

#### Scenario: Relay audit environment path contains ASCII control characters
- **WHEN** the relay is configured with a `WINBRIDGE_RELAY_AUDIT_LOG_PATH` value containing an ASCII control character
- **THEN** relay startup fails before selecting console audit fallback or accepting peer connections
- **AND** the failure MUST NOT expose the raw path value

#### Scenario: Relay audit environment path contains format controls
- **WHEN** the relay is configured with a `WINBRIDGE_RELAY_AUDIT_LOG_PATH` value containing a Unicode bidirectional or zero-width formatting control
- **THEN** relay startup fails before selecting console audit fallback or accepting peer connections
- **AND** the failure MUST NOT expose the raw path value

#### Scenario: Relay audit environment path is oversized
- **WHEN** the relay is configured with a `WINBRIDGE_RELAY_AUDIT_LOG_PATH` value whose UTF-8 byte length exceeds 1024 bytes
- **THEN** relay startup fails before selecting console audit fallback or accepting peer connections
- **AND** the failure MUST NOT expose the raw path value

#### Scenario: Agent audit environment path is blank
- **WHEN** the agent shell is configured with an empty or whitespace-only `WINBRIDGE_AGENT_AUDIT_LOG_PATH`
- **THEN** argument parsing fails before starting the runtime or connecting to the relay

#### Scenario: Agent audit environment path is untrimmed
- **WHEN** the agent shell is configured with a `WINBRIDGE_AGENT_AUDIT_LOG_PATH` value containing leading or trailing whitespace
- **THEN** argument parsing fails before starting the runtime or connecting to the relay

#### Scenario: Agent audit environment path contains ASCII control characters
- **WHEN** the agent shell is configured with a `WINBRIDGE_AGENT_AUDIT_LOG_PATH` value containing an ASCII control character
- **THEN** argument parsing fails before starting the runtime or connecting to the relay
- **AND** the failure MUST NOT expose the raw path value

#### Scenario: Agent audit environment path contains format controls
- **WHEN** the agent shell is configured with a `WINBRIDGE_AGENT_AUDIT_LOG_PATH` value containing a Unicode bidirectional or zero-width formatting control
- **THEN** argument parsing fails before starting the runtime or connecting to the relay
- **AND** the failure MUST NOT expose the raw path value

#### Scenario: Agent audit environment path is oversized
- **WHEN** the agent shell is configured with a `WINBRIDGE_AGENT_AUDIT_LOG_PATH` value whose UTF-8 byte length exceeds 1024 bytes
- **THEN** argument parsing fails before starting the runtime or connecting to the relay
- **AND** the failure MUST NOT expose the raw path value

#### Scenario: Agent audit CLI path is blank
- **WHEN** the agent shell is started with an empty or whitespace-only `--audit-log` value
- **THEN** argument parsing fails before starting the runtime or connecting to the relay

#### Scenario: Agent audit CLI path is untrimmed
- **WHEN** the agent shell is started with a `--audit-log` value containing leading or trailing whitespace
- **THEN** argument parsing fails before starting the runtime or connecting to the relay

#### Scenario: Agent audit CLI path contains ASCII control characters
- **WHEN** the agent shell is started with a `--audit-log` value containing an ASCII control character
- **THEN** argument parsing fails before starting the runtime or connecting to the relay
- **AND** the failure MUST NOT expose the raw path value

#### Scenario: Agent audit CLI path contains format controls
- **WHEN** the agent shell is started with a `--audit-log` value containing a Unicode bidirectional or zero-width formatting control
- **THEN** argument parsing fails before starting the runtime or connecting to the relay
- **AND** the failure MUST NOT expose the raw path value

#### Scenario: Agent audit CLI path is oversized
- **WHEN** the agent shell is started with a `--audit-log` value whose UTF-8 byte length exceeds 1024 bytes
- **THEN** argument parsing fails before starting the runtime or connecting to the relay
- **AND** the failure MUST NOT expose the raw path value
