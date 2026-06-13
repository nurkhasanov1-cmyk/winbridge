## MODIFIED Requirements

### Requirement: Development pairing ticket runtime configuration
The relay runtime SHALL allow development pairing ticket TTL and maximum-use settings to be configured for tests and local execution, and SHALL reject malformed or unsafe environment-derived or injected pairing ticket configuration before opening a listener, accepting peer connections, or creating pairing tickets. Validated pairing ticket configuration SHALL be represented as a fresh immutable snapshot before use so caller mutations after validation cannot change ticket TTL or maximum-use behavior.

#### Scenario: Runtime uses injected pairing settings
- **WHEN** tests create the relay runtime with explicit pairing ticket TTL and maximum-use settings
- **THEN** the runtime uses those values for host-created relay pairing tickets

#### Scenario: CLI uses environment pairing settings
- **WHEN** the relay CLI starts with pairing ticket environment variables
- **THEN** the runtime uses those values for development pairing tickets

#### Scenario: CLI omits pairing ticket environment
- **WHEN** the relay CLI starts without pairing ticket environment variables
- **THEN** the runtime uses development pairing ticket defaults

#### Scenario: Malformed pairing ticket environment is rejected
- **WHEN** the relay is configured with empty, partial, fractional, negative, or out-of-range pairing ticket TTL or maximum-use environment values
- **THEN** the relay rejects configuration before opening a listener or accepting peer connections

#### Scenario: Unsafe injected pairing settings are rejected
- **WHEN** tests create the relay runtime or room registry with non-number, non-finite, non-integer, negative, null, zero-use, or out-of-range pairing ticket settings
- **THEN** the runtime rejects configuration before creating host pairing tickets

#### Scenario: Normalized pairing configuration is immutable
- **WHEN** caller code normalizes safe pairing settings and then tries to mutate the returned config object
- **THEN** the validated TTL and maximum-use fields remain unchanged
- **AND** the mutation MUST NOT create unsafe ticket behavior, grant permissions, start capture, send input, suppress host visibility, or bypass consent workflows

#### Scenario: Room registry snapshots injected pairing configuration
- **WHEN** caller code constructs a room registry with safe injected pairing settings and later mutates the original config object before host pairing ticket creation
- **THEN** host-created pairing tickets use the validated values captured during registry construction
- **AND** the later mutation MUST NOT extend or shorten ticket TTL, change maximum-use behavior, approve sessions, grant permissions, start capture, send input, suppress host visibility, or bypass consent workflows
