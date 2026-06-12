## ADDED Requirements

### Requirement: Keylogging audit detail redaction
The shared audit layer SHALL treat audit detail keys that indicate keylogging content as sensitive and redact their values before records are stored, emitted, encoded, or persisted.

#### Scenario: Keylog audit detail is redacted
- **WHEN** a component writes audit details with field names such as `keylog`, `keylogger`, `rawKeylog`, or `keyloggerOutput`
- **THEN** the audit layer MUST replace those values with `[REDACTED]`

#### Scenario: Keylog redaction is recursive
- **WHEN** keylogging-related field names appear inside nested objects or arrays in audit details
- **THEN** the audit layer MUST redact those values recursively while preserving non-sensitive metadata

#### Scenario: Keylog redaction does not create a capability
- **WHEN** audit detail redaction handles a keylogging-related field name
- **THEN** that redaction MUST NOT authorize keylogging, input capture, screen capture, clipboard access, file transfer, diagnostics collection, hidden sessions, or consent bypass
