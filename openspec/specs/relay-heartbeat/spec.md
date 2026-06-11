# relay-heartbeat Specification

## Purpose
Defines development relay liveness checks, stale peer timeout behavior, and secret-safe heartbeat timeout audit requirements.
## Requirements
### Requirement: Configurable relay heartbeat
The relay SHALL support development heartbeat configuration for WebSocket peer liveness checks with safe default interval and timeout values.

#### Scenario: Heartbeat environment omitted
- **WHEN** the relay starts without heartbeat environment variables
- **THEN** the relay uses development heartbeat defaults and enables liveness checks

#### Scenario: Heartbeat disabled for a test runtime
- **WHEN** a test creates a managed relay runtime with heartbeat disabled
- **THEN** the relay does not create peer heartbeat timers for that runtime

### Requirement: Stale peer timeout
The relay SHALL close an accepted WebSocket peer that does not respond to a relay heartbeat within the configured timeout.

#### Scenario: Peer misses heartbeat response
- **WHEN** an accepted peer is awaiting a heartbeat response beyond the configured timeout
- **THEN** the relay terminates that peer connection and removes the peer from relay room membership through the normal close cleanup

### Requirement: Heartbeat timeout audit
The relay SHALL emit a secret-safe audit event when a peer is terminated because of heartbeat timeout.

#### Scenario: Heartbeat timeout is audited
- **WHEN** the relay terminates a peer because the peer missed heartbeat response
- **THEN** the audit event records failed outcome, relay actor, peer role when known, session identifier when known, and heartbeat timing metadata
- **AND** the audit event MUST NOT include raw shared tokens, pairing codes, protocol payloads, credentials, or Windows secrets

### Requirement: Heartbeat safety boundary
Relay heartbeat checks MUST NOT grant permissions, approve sessions, start capture, send input, suppress host visibility, or bypass consent workflows.

#### Scenario: Heartbeat runs during an unapproved session attempt
- **WHEN** heartbeat checks run for a relay peer that has not completed an authorized remote assistance workflow
- **THEN** heartbeat only verifies transport liveness and does not change authorization, consent, visibility, capture, or input state
