## ADDED Requirements

### Requirement: Testable relay-error transport race handling
The relay runtime SHALL expose integration-test coverage proving rejected-message handling remains fail-closed when peer-facing `relay-error` delivery is skipped because the sender WebSocket is closing. The runtime MUST keep rejection audit records bounded and secret-safe in this path.

#### Scenario: Runtime skips relay-error on closing sender socket
- **WHEN** integration tests force a sender socket to close during relay rejection handling
- **THEN** the runtime does not forward the rejected message
- **AND** the runtime records a bounded rejection audit event without raw pairing codes, tokens, credentials, protocol payloads, private reasons, keystrokes, screenshots, screen contents, or full secrets
