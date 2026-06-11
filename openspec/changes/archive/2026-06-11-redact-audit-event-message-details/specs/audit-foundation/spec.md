## ADDED Requirements

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
