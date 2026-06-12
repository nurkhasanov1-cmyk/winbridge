# audit-log-persistence Specification

## Purpose
Defines local development JSONL audit persistence and write-failure behavior for relay and agent-shell audit sinks.
## Requirements
### Requirement: JSONL file audit sink
The system SHALL provide a development file audit sink that appends one schema-valid audit record as JSON per line.

#### Scenario: File sink writes records
- **WHEN** two audit records are written to the file sink
- **THEN** the audit file contains two JSON lines in write order

### Requirement: File sink redaction
The file audit sink MUST apply audit redaction before persisting records.

#### Scenario: Sensitive audit detail is written
- **WHEN** audit details include token, credential, pairingCode, keystroke, screenshot, or screenData fields
- **THEN** the persisted JSON line contains redacted placeholders instead of raw sensitive values

### Requirement: Audit reason redaction
The system SHALL redact top-level audit `reason` values that contain obvious sensitive material before returning, logging, or persisting audit records through shared audit creation and sinks.

#### Scenario: Sensitive audit reason is redacted
- **WHEN** an audit record is created with a top-level reason containing a token, credential, pairing code, API key, authorization header, auth header, cookie, private key, keystroke, screenshot, screen data, screen content, or secret marker
- **THEN** the created audit record contains a redacted reason value and does not expose the raw sensitive reason text

#### Scenario: Safe bounded audit reason is preserved
- **WHEN** an audit record is created with a bounded metadata-only reason
- **THEN** the created audit record preserves that reason

#### Scenario: Persisted audit reason is redacted
- **WHEN** a shared audit sink writes a record whose top-level reason contains obvious sensitive material
- **THEN** the persisted or emitted audit output contains a redacted reason value and does not contain the raw sensitive reason text

### Requirement: Audit write failures are surfaced
The file audit sink SHALL surface write failures to the caller instead of silently dropping audit records.

#### Scenario: File path cannot be written
- **WHEN** the sink cannot create or append to the configured file path
- **THEN** the write operation throws an error

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

### Requirement: Relay file audit configuration
The relay SHALL use the file audit sink when `WINBRIDGE_RELAY_AUDIT_LOG_PATH` is configured.

#### Scenario: Relay audit path is configured
- **WHEN** the relay starts with `WINBRIDGE_RELAY_AUDIT_LOG_PATH`
- **THEN** relay audit events are written to that JSONL file through the file audit sink

### Requirement: Agent shell file audit configuration
The agent shell SHALL use the development JSONL file audit sink when an audit log path is configured for local workflow audit persistence.

#### Scenario: Agent shell audit path is configured by CLI
- **WHEN** the agent shell starts with an explicit audit log path
- **THEN** host workflow audit records are written to that JSONL file through the shared file audit sink

#### Scenario: Agent shell audit path is configured by environment
- **WHEN** the agent shell starts with `WINBRIDGE_AGENT_AUDIT_LOG_PATH`
- **THEN** host workflow audit records are written to that JSONL file through the shared file audit sink

#### Scenario: Agent shell audit path is omitted
- **WHEN** the agent shell starts without an audit log path
- **THEN** it does not create a local audit file and continues to emit protocol audit-event messages when configured workflow events occur

#### Scenario: Agent shell file audit redacts sensitive detail
- **WHEN** an agent shell workflow audit record is written to the configured file
- **THEN** the persisted JSON line is schema-valid and contains redacted placeholders instead of raw sensitive values if any sensitive detail key is present
