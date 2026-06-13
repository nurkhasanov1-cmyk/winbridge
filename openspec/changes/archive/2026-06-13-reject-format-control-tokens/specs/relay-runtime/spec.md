## MODIFIED Requirements

### Requirement: Testable shared-token configuration
The managed relay runtime SHALL reject malformed development shared-token configuration before creating a listener, opening a listening socket, or accepting peer connections. Malformed shared-token configuration MUST include non-string, blank, whitespace-only, untrimmed, ASCII-control-character, Unicode bidirectional-formatting-control, zero-width-formatting-control, or oversized values.

#### Scenario: Runtime shared token configuration is malformed
- **WHEN** tests create the relay runtime with non-string, blank, untrimmed, ASCII-control-character, Unicode bidirectional-formatting-control, zero-width-formatting-control, or oversized shared-token configuration
- **THEN** the runtime rejects configuration before accepting peer connections

#### Scenario: Environment shared token configuration is malformed
- **WHEN** the relay shared-token environment value is blank, untrimmed, ASCII-control-character, Unicode bidirectional-formatting-control, zero-width-formatting-control, or oversized
- **THEN** relay shared-token config parsing rejects the value before accepting peer connections

#### Scenario: Shared-token config rejection does not leak secrets
- **WHEN** relay shared-token configuration is rejected
- **THEN** thrown errors, startup diagnostics, audit records, and logs MUST NOT expose the raw shared token, token whitespace shape, pairing codes, credentials, protocol payloads, keystrokes, screenshots, screen contents, or full secrets
