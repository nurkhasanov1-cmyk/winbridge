## ADDED Requirements

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

### Requirement: Audit write failures are surfaced
The file audit sink SHALL surface write failures to the caller instead of silently dropping audit records.

#### Scenario: File path cannot be written
- **WHEN** the sink cannot create or append to the configured file path
- **THEN** the write operation throws an error

### Requirement: Relay file audit configuration
The relay SHALL use the file audit sink when `WINBRIDGE_RELAY_AUDIT_LOG_PATH` is configured.

#### Scenario: Relay audit path is configured
- **WHEN** the relay starts with `WINBRIDGE_RELAY_AUDIT_LOG_PATH`
- **THEN** relay audit events are written to that JSONL file through the file audit sink
