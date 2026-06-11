## MODIFIED Requirements

### Requirement: Testable heartbeat configuration
The managed relay runtime SHALL allow callers to inject relay heartbeat settings or disable heartbeat timers for tests, and SHALL reject unsafe injected heartbeat timer values before starting peer heartbeat timers.

#### Scenario: Runtime receives injected heartbeat settings
- **WHEN** tests create the relay runtime with explicit heartbeat interval and timeout values
- **THEN** the runtime uses those values instead of environment-derived defaults

#### Scenario: Runtime disables heartbeat timers
- **WHEN** tests create the relay runtime with heartbeat disabled
- **THEN** the runtime accepts peers without starting per-peer heartbeat timers

#### Scenario: Runtime rejects unsafe injected heartbeat settings
- **WHEN** tests create the relay runtime with non-integer, non-positive, or timer-unsafe heartbeat interval or timeout values
- **THEN** the runtime rejects configuration before starting peer heartbeat timers
