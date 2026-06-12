## ADDED Requirements

### Requirement: Testable shared-token configuration
The managed relay runtime SHALL reject malformed development shared-token configuration before creating a listener, opening a listening socket, or accepting peer connections.

#### Scenario: Runtime shared token configuration is malformed
- **WHEN** tests create the relay runtime with non-string, blank, control-character, or oversized shared-token configuration
- **THEN** the runtime rejects configuration before accepting peer connections

#### Scenario: Environment shared token configuration is malformed
- **WHEN** the relay shared-token environment value is blank, control-character, or oversized
- **THEN** relay shared-token config parsing rejects the value before accepting peer connections
