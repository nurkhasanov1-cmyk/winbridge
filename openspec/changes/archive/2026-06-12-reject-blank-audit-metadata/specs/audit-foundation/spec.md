## MODIFIED Requirements

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
