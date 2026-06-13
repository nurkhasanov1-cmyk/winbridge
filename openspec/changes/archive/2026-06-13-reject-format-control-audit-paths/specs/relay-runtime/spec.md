## MODIFIED Requirements

### Requirement: Relay audit path runtime validation
The relay runtime SHALL reject configured development audit log paths that are empty, whitespace-only, untrimmed, exceed 1024 UTF-8 bytes, contain ASCII control characters, contain Unicode bidirectional formatting controls, or contain zero-width formatting controls before selecting a file audit sink, opening a listener, or accepting peer connections.

#### Scenario: Relay audit path contains format controls
- **WHEN** the relay is configured with a `WINBRIDGE_RELAY_AUDIT_LOG_PATH` value containing a Unicode bidirectional or zero-width formatting control
- **THEN** relay startup fails before selecting a file audit sink, opening a listener, or accepting peer connections
- **AND** startup diagnostics MUST NOT include the raw configured path value
