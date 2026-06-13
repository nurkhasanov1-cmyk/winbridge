# audit-log-persistence Specification

## Purpose
Defines local development JSONL audit persistence and write-failure behavior for relay and agent-shell audit sinks.
## Requirements
### Requirement: JSONL file audit sink
The system SHALL provide a development file audit sink that appends one schema-valid audit record as JSON per line.

#### Scenario: File sink writes records
- **WHEN** two audit records are written to the file sink
- **THEN** the audit file contains two JSON lines in write order

### Requirement: File audit detail JSON compatibility
The file audit sink SHALL reject audit records whose detail metadata contains non-JSON values before appending to the JSONL audit file.

#### Scenario: File sink rejects non-JSON detail before writing
- **WHEN** a file audit sink is asked to write an audit record whose detail contains a function, symbol, bigint, `undefined`, `NaN`, `Infinity`, `-Infinity`, cyclic value, own symbol-keyed property, own non-enumerable property, accessor property, sparse array, or non-index array property
- **THEN** the write fails and no partial audit record is appended for that event

#### Scenario: File sink writes JSON-compatible detail
- **WHEN** a file audit sink is asked to write an audit record whose detail contains JSON-compatible values
- **THEN** the persisted JSON line contains one schema-valid audit record with those detail values after redaction

### Requirement: File sink redaction
The file audit sink MUST apply audit redaction before persisting records.

#### Scenario: Sensitive audit detail is written
- **WHEN** audit details include token, credential, pairingCode, keystroke, screenshot, screenData, clipboardText, fileContent, fileBytes, or diagnosticDump fields
- **THEN** the persisted JSON line contains redacted placeholders instead of raw sensitive values

### Requirement: File sink keylogging redaction
The file audit sink SHALL apply shared keylogging-related audit detail redaction before appending JSONL records.

#### Scenario: Keylog detail is persisted redacted
- **WHEN** a file audit sink writes an audit record whose detail contains keylogging-related field names such as `keylog` or `keyloggerOutput`
- **THEN** the persisted JSON line contains redacted placeholders instead of raw keylogging values

#### Scenario: Non-sensitive file audit metadata remains inspectable
- **WHEN** a file audit sink writes an audit record whose detail contains non-sensitive operational metadata alongside keylogging-related fields
- **THEN** the persisted JSON line preserves the non-sensitive metadata unless another sensitive key rule applies

### Requirement: Audit reason redaction
The system SHALL redact top-level audit `reason` values that contain obvious sensitive material before returning, logging, or persisting audit records through shared audit creation and sinks, while preserving fixed bounded metadata-only reason strings.

#### Scenario: Sensitive audit reason is redacted
- **WHEN** an audit record is created with a top-level reason containing a token, credential, pairing code, API key, authorization header, auth header, cookie, private key, keystroke, screenshot, screen data, screen content, clipboard content, file-transfer content/data/bytes, diagnostics content/dump, or secret marker plus a secret-bearing value
- **THEN** the created audit record contains a redacted reason value and does not expose the raw sensitive reason text

#### Scenario: Safe bounded audit reason is preserved
- **WHEN** an audit record is created with a bounded metadata-only reason
- **THEN** the created audit record preserves that reason

#### Scenario: Safe bounded token diagnostic reason is preserved
- **WHEN** an audit record is created with a fixed bounded token diagnostic reason such as a relay token rate-limit reason
- **THEN** the created audit record preserves that reason because it does not contain a raw token value

#### Scenario: Persisted audit reason is redacted
- **WHEN** a shared audit sink writes a record whose top-level reason contains obvious sensitive material
- **THEN** the persisted or emitted audit output contains a redacted reason value and does not contain the raw sensitive reason text

### Requirement: Access-key and SSH-key audit reason redaction
The audit layer SHALL redact top-level audit `reason` values that contain access-key or SSH-key material before records are returned, logged, stored, emitted, encoded, or persisted.

#### Scenario: Access-key audit reason is redacted
- **WHEN** a component creates an audit record with a top-level reason containing access-key material
- **THEN** the audit layer MUST replace the reason with `[REDACTED]`
- **AND** the created audit record MUST NOT contain the raw access-key value

#### Scenario: SSH-key audit reason is redacted
- **WHEN** a component creates an audit record with a top-level reason containing SSH-key material
- **THEN** the audit layer MUST replace the reason with `[REDACTED]`
- **AND** the created audit record MUST NOT contain the raw SSH-key value

#### Scenario: Bounded reason codes remain inspectable
- **WHEN** a component creates an audit record with an existing bounded safe reason code
- **THEN** the audit layer MUST preserve that safe reason code

### Requirement: Audit write failures are surfaced
The file audit sink SHALL surface write failures to the caller instead of silently dropping audit records.

#### Scenario: File path cannot be written
- **WHEN** the sink cannot create or append to the configured file path
- **THEN** the write operation throws an error

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

### Requirement: File sink private metadata redaction
The file audit sink SHALL apply shared audit redaction for raw display-name and private reason detail fields before appending JSONL records.

#### Scenario: Display-name and private reason detail is written
- **WHEN** a file audit sink writes a record whose detail contains raw display-name or private reason fields
- **THEN** the persisted JSON line contains redacted placeholders instead of those raw values

#### Scenario: Safe reason metadata is written
- **WHEN** a file audit sink writes a record whose detail contains safe metadata such as `reasonCode`, `reasonConfigured`, or `authorizationId`
- **THEN** the persisted JSON line preserves those metadata values unless another sensitive key rule applies
