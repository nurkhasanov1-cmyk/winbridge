# audit-foundation Specification

## Purpose
Defines the shared audit record contract and relay audit events needed for consent, join, rejection, and safety-relevant decisions.
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
The system SHALL validate audit records before storing or emitting them through audit sinks. Audit records MUST reject blank or whitespace-only semantic metadata fields, including action, optional reason, and target type.

#### Scenario: Audit record misses required actor
- **WHEN** a component writes an audit record without required actor metadata
- **THEN** the audit sink rejects the record

#### Scenario: Audit record action is blank
- **WHEN** a component writes an audit record with an empty or whitespace-only action
- **THEN** the audit sink rejects the record before storing or emitting meaningless action metadata

#### Scenario: Audit record reason is blank
- **WHEN** a component writes an audit record with a whitespace-only reason
- **THEN** the audit sink rejects the record instead of storing meaningless reason metadata

#### Scenario: Audit record target type is blank
- **WHEN** a component writes an audit record with a whitespace-only target type
- **THEN** the audit sink rejects the record before storing ambiguous target metadata

### Requirement: Audit redaction
The system MUST NOT store raw credentials, raw tokens, raw pairing codes, keystroke contents, screenshots, screen contents, or full secrets in audit details.

#### Scenario: Audit details contain sensitive field
- **WHEN** a component writes audit details with a sensitive field name such as token, credential, password, pairingCode, keystroke, screenshot, or screenData
- **THEN** the audit layer redacts the sensitive value before storage or console output

### Requirement: Audit detail redaction covers common authentication keys
The system SHALL redact audit detail fields whose key names indicate common authentication or session secret material, including API keys, authorization headers, auth headers, cookies, set-cookie values, session cookies, and private keys.

#### Scenario: Expanded secret keys are redacted
- **WHEN** a component writes audit details with fields named `apiKey`, `authorization`, `authHeader`, `cookie`, `setCookie`, `sessionCookie`, or `privateKey`
- **THEN** the audit record detail MUST replace those values with `[REDACTED]`

#### Scenario: Expanded secret keys are redacted recursively
- **WHEN** expanded secret-bearing field names appear inside nested objects or arrays in audit details
- **THEN** the audit record detail MUST redact those values recursively

#### Scenario: Non-secret authorization identifiers remain inspectable
- **WHEN** audit details include a non-secret lifecycle identifier such as `authorizationId`
- **THEN** the audit record detail MUST preserve that identifier value unless another sensitive key rule applies

### Requirement: Protocol audit-event detail redaction
The system SHALL redact sensitive fields in protocol `audit-event` message details during schema parsing and encoding before the message is emitted, forwarded, or stored by development components. Protocol `audit-event` messages MUST reject blank or whitespace-only action metadata before parsing, forwarding, encoding, or persistence.

#### Scenario: Audit-event detail includes sensitive fields
- **WHEN** an `audit-event` protocol message detail includes fields named token, credential, password, pairingCode, keystroke, screenshot, screenData, screenContent, secret, apiKey, authorization, authHeader, cookie, setCookie, sessionCookie, or privateKey
- **THEN** the protocol schema replaces those values with a redaction marker before returning or encoding the message

#### Scenario: Audit-event detail has nested sensitive fields
- **WHEN** an `audit-event` protocol message detail contains nested objects or arrays with sensitive field names
- **THEN** the protocol schema recursively redacts those sensitive values while preserving non-sensitive metadata

#### Scenario: Audit-event detail preserves non-secret authorization identifiers
- **WHEN** an `audit-event` protocol message detail includes a non-secret lifecycle identifier such as `authorizationId`
- **THEN** the protocol schema preserves that identifier value unless another sensitive key rule applies

#### Scenario: Audit-event detail is omitted
- **WHEN** an `audit-event` protocol message omits detail metadata
- **THEN** the protocol schema accepts the message and uses an empty detail object

#### Scenario: Audit-event action is blank
- **WHEN** an `audit-event` protocol message includes an empty or whitespace-only action
- **THEN** the protocol schema rejects the message before it can be forwarded, encoded, emitted, or persisted with meaningless action metadata
