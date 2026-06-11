# audit-foundation Specification

## Purpose
TBD - created by archiving change add-identity-pairing-audit-foundation. Update Purpose after archive.
## Requirements
### Requirement: Structured audit record
The system SHALL represent security-relevant events as structured audit records with event id, timestamp, actor, action, outcome, and optional session id.

#### Scenario: Relay accepts a peer join
- **WHEN** the relay accepts a peer into a session room
- **THEN** it emits an audit record with actor peer id, session id, `relay.peer.join.accepted`, and accepted outcome

#### Scenario: Relay rejects a message
- **WHEN** the relay rejects a token, join, or malformed protocol message
- **THEN** it emits an audit record with denied or failed outcome without logging raw token or raw pairing code

#### Scenario: Pairing lifecycle event
- **WHEN** pairing is created, consumed, expired, denied, or revoked
- **THEN** the system emits an audit record with actor, session id or pairing id, action, outcome, and reason code when available

### Requirement: Development audit sinks
The system SHALL provide reusable development audit sinks for tests and local debugging.

#### Scenario: In-memory audit sink records events
- **WHEN** a component writes audit records to the in-memory sink
- **THEN** tests can inspect the records in write order

#### Scenario: Console audit sink writes event lines
- **WHEN** a component writes audit records to the console sink
- **THEN** each record is serialized as one JSON line

### Requirement: Audit schema validation
The system SHALL validate audit records before storing or emitting them through audit sinks.

#### Scenario: Audit record misses required actor
- **WHEN** a component writes an audit record without required actor metadata
- **THEN** the audit sink rejects the record

### Requirement: Audit redaction
The system MUST NOT store raw credentials, raw tokens, raw pairing codes, keystroke contents, screenshots, screen contents, or full secrets in audit details.

#### Scenario: Audit details contain sensitive field
- **WHEN** a component writes audit details with a sensitive field name such as token, credential, password, pairingCode, keystroke, screenshot, or screenData
- **THEN** the audit layer redacts the sensitive value before storage or console output

### Requirement: Protocol audit-event detail redaction
The system SHALL redact sensitive fields in protocol `audit-event` message details during schema parsing and encoding before the message is emitted, forwarded, or stored by development components.

#### Scenario: Audit-event detail includes sensitive fields
- **WHEN** an `audit-event` protocol message detail includes fields named token, credential, password, pairingCode, keystroke, screenshot, screenData, screenContent, or secret
- **THEN** the protocol schema replaces those values with a redaction marker before returning or encoding the message

#### Scenario: Audit-event detail has nested sensitive fields
- **WHEN** an `audit-event` protocol message detail contains nested objects or arrays with sensitive field names
- **THEN** the protocol schema recursively redacts those sensitive values while preserving non-sensitive metadata

#### Scenario: Audit-event detail is omitted
- **WHEN** an `audit-event` protocol message omits detail metadata
- **THEN** the protocol schema accepts the message and uses an empty detail object

