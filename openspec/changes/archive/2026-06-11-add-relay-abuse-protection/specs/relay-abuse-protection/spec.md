## ADDED Requirements

### Requirement: Invalid token rate limiting
The relay SHALL rate-limit repeated invalid shared-token attempts before a peer joins a session.

#### Scenario: Invalid token attempts exceed limit
- **WHEN** a remote address exceeds the configured invalid token attempt limit
- **THEN** the relay closes the connection and emits an audit event with denied outcome and rate-limited metadata

### Requirement: Invalid message rate limiting
The relay SHALL rate-limit repeated malformed or rejected protocol messages from the same registered peer or remote address.

#### Scenario: Malformed messages exceed limit
- **WHEN** a peer repeatedly sends malformed or rejected protocol messages beyond the configured limit
- **THEN** the relay closes the connection and emits an audit event with failed outcome and rate-limited metadata

### Requirement: Secret-safe rate-limit audit details
The relay MUST NOT include raw tokens, raw pairing codes, credentials, or protocol payload secrets in rate-limit audit details.

#### Scenario: Rate limit audit is emitted
- **WHEN** the relay audits an invalid token, join failure, or malformed message
- **THEN** the audit detail includes only safe metadata such as remaining attempts, reset time, registered state, and booleans

### Requirement: Development-only limiter configuration
The relay SHALL expose simple environment configuration for development rate-limit windows and limits while documenting that production needs distributed abuse protection.

#### Scenario: Rate limit environment is omitted
- **WHEN** no rate-limit environment variables are set
- **THEN** the relay uses safe development defaults
