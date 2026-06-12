## ADDED Requirements

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
