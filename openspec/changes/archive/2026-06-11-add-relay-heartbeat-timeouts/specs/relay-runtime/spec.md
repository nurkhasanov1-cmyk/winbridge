## ADDED Requirements

### Requirement: Testable heartbeat configuration
The managed relay runtime SHALL allow callers to inject relay heartbeat settings or disable heartbeat timers for tests.

#### Scenario: Runtime receives injected heartbeat settings
- **WHEN** tests create a relay runtime with explicit heartbeat interval and timeout values
- **THEN** the runtime uses those values instead of environment-derived defaults

#### Scenario: Runtime disables heartbeat timers
- **WHEN** tests create a relay runtime with heartbeat disabled
- **THEN** the runtime accepts peers without starting per-peer heartbeat timers

### Requirement: CLI heartbeat defaults
The relay CLI SHALL start the managed relay runtime with environment-derived heartbeat configuration.

#### Scenario: CLI starts without heartbeat variables
- **WHEN** the relay CLI starts without heartbeat environment variables
- **THEN** the runtime enables development heartbeat defaults
