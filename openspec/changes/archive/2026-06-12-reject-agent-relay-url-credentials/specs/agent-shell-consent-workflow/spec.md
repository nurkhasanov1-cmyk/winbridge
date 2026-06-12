## MODIFIED Requirements

### Requirement: Managed runtime option validation
The managed agent shell runtime SHALL reject malformed direct runtime options before opening a relay connection, sending protocol messages, scheduling workflow timers, or emitting authorization decisions. Relay URLs MUST NOT contain embedded credentials/userinfo, and relay shared-token values MUST be supplied through the dedicated token field rather than embedded in the relay URL query string.

#### Scenario: Runtime relay URL is not WebSocket
- **WHEN** the managed runtime is configured with a malformed, relative, or non-WebSocket relay URL
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime relay URL carries credentials
- **WHEN** the managed runtime is configured with a relay URL containing username or password/userinfo credentials
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime relay URL carries token query
- **WHEN** the managed runtime is configured with a relay URL containing a `token` query parameter
- **THEN** it fails before connecting to the relay or sending any protocol message

### Requirement: Agent shell CLI argument validation
The agent shell SHALL reject malformed, unknown, or ambiguous CLI arguments before starting the runtime, including duplicate requested permissions. Relay URLs MUST NOT contain embedded credentials/userinfo, and relay shared-token values MUST be supplied through `--token` rather than embedded in `--relay` URLs.

#### Scenario: Invalid relay URL option is rejected
- **WHEN** the agent shell is started with a malformed, relative, or non-WebSocket `--relay` URL
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Relay URL credentials are rejected
- **WHEN** the agent shell is started with a `--relay` value containing username or password/userinfo credentials
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Relay URL token query is rejected
- **WHEN** the agent shell is started with a `--relay` value containing a `token` query parameter
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message
