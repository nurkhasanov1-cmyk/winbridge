## MODIFIED Requirements

### Requirement: Configurable relay heartbeat
The relay SHALL support development heartbeat configuration for WebSocket peer liveness checks with safe default interval and timeout values, and SHALL reject malformed or unsafe heartbeat timer configuration before accepting peers.

#### Scenario: Heartbeat environment omitted
- **WHEN** the relay starts without heartbeat environment variables
- **THEN** the relay uses development heartbeat defaults and enables liveness checks

#### Scenario: Heartbeat disabled for a test runtime
- **WHEN** a test creates a managed relay runtime with heartbeat disabled
- **THEN** the relay does not create peer heartbeat timers for that runtime

#### Scenario: Heartbeat timer environment is malformed
- **WHEN** the relay is configured with empty, partial, fractional, negative, zero, or timer-unsafe heartbeat interval or timeout environment values
- **THEN** the relay rejects configuration before accepting peer connections or scheduling heartbeat timers
