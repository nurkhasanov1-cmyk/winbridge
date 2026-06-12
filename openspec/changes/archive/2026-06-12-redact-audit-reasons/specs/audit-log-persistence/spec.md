# audit-log-persistence Delta

## ADDED Requirements

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
