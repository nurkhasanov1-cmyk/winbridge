# relay-runtime Specification

## Purpose
TBD - created by archiving change add-relay-runtime-integration-harness. Update Purpose after archive.
## Requirements
### Requirement: Managed relay lifecycle
The development relay SHALL expose a managed runtime with explicit start and stop operations.

#### Scenario: Runtime starts on ephemeral port
- **WHEN** tests start the relay runtime with port `0`
- **THEN** the runtime listens on an available local port and reports its WebSocket URL

#### Scenario: Runtime stops
- **WHEN** tests stop the relay runtime
- **THEN** the WebSocket server and HTTP server are closed

### Requirement: Shared CLI and test implementation
The relay CLI and integration tests SHALL use the same runtime implementation.

#### Scenario: CLI starts relay
- **WHEN** the relay CLI is executed
- **THEN** it starts the managed relay runtime with environment-derived configuration

### Requirement: End-to-end broker verification
The relay runtime SHALL be verifiable through WebSocket integration tests for accepted joins, message forwarding, rejected joins, invalid tokens, and rate-limit closure.

#### Scenario: Host and viewer exchange messages
- **WHEN** a host and viewer join the same session with matching pairing credentials
- **THEN** the relay returns readiness to both peers and forwards protocol messages between them

#### Scenario: Viewer uses wrong pairing credential
- **WHEN** a viewer joins a host session with a mismatched pairing credential
- **THEN** the relay rejects the join and does not register the viewer as authorized in the room

### Requirement: Testable audit behavior
The relay runtime SHALL allow tests to inject audit sinks and inspect security-relevant runtime events.

#### Scenario: Runtime rejects invalid token
- **WHEN** a peer connects with an invalid shared token
- **THEN** the injected audit sink receives a secret-safe denied token event

