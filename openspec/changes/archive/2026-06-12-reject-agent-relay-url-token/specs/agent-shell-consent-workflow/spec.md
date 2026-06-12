## MODIFIED Requirements

### Requirement: Managed runtime option validation
The managed agent shell runtime SHALL reject malformed direct runtime options before opening a relay connection, sending protocol messages, scheduling workflow timers, or emitting authorization decisions. Relay shared-token values MUST be supplied through the dedicated token field and MUST NOT be embedded in the relay URL query string.

#### Scenario: Runtime relay URL is not WebSocket
- **WHEN** the managed runtime is configured with a malformed, relative, or non-WebSocket relay URL
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime relay URL carries token query
- **WHEN** the managed runtime is configured with a relay URL containing a `token` query parameter
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime identity fields are malformed
- **WHEN** the managed runtime is configured with a malformed role, session id, pairing code, peer id, device id, or display name
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime requested permissions are malformed
- **WHEN** the managed runtime is configured with unknown, duplicate, or too many requested permissions
- **THEN** it fails before connecting to the relay or sending any authorization request

#### Scenario: Runtime token is blank
- **WHEN** the managed runtime is configured with an empty or whitespace-only token
- **THEN** it fails before connecting to the relay or adding the token to a relay URL

#### Scenario: Runtime workflow timer is unsafe
- **WHEN** the managed runtime is configured with a negative, fractional, non-integer, or timer-unsafe workflow delay
- **THEN** it fails before scheduling revoke, pause, resume, terminate, or expiration workflow timers

#### Scenario: Runtime visible-session flag is malformed
- **WHEN** the managed runtime is configured with a non-boolean visible-session flag
- **THEN** it fails before sending an authorization decision or state update

#### Scenario: Runtime decision or lifecycle reason is malformed
- **WHEN** the managed runtime is configured with an unknown host decision or blank or oversized decision/lifecycle reason text
- **THEN** it fails before sending decisions or lifecycle messages

#### Scenario: Runtime revoke permission is malformed
- **WHEN** the managed runtime is configured with an invalid revoke permission
- **THEN** it fails before scheduling or sending revocation messages

### Requirement: Agent shell CLI argument validation
The agent shell SHALL reject malformed, unknown, or ambiguous CLI arguments before starting the runtime, including duplicate requested permissions. Relay shared-token values MUST be supplied through `--token` and MUST NOT be embedded in `--relay` URLs.

#### Scenario: Unknown CLI option is rejected
- **WHEN** the agent shell is started with an unknown option
- **THEN** it exits with usage guidance before connecting to the relay

#### Scenario: Invalid relay URL option is rejected
- **WHEN** the agent shell is started with a malformed, relative, or non-WebSocket `--relay` value
- **THEN** it exits with usage guidance before connecting to the relay

#### Scenario: Relay URL token query is rejected
- **WHEN** the agent shell is started with a `--relay` value containing a `token` query parameter
- **THEN** it exits with usage guidance before connecting to the relay

#### Scenario: Visible session value is explicit
- **WHEN** the agent shell is started with `--visible-session`
- **THEN** the value MUST be either `true` or `false`

#### Scenario: Invalid permission option is rejected
- **WHEN** the agent shell is started with an unknown requested or revoked permission
- **THEN** it exits with usage guidance before connecting to the relay

#### Scenario: Duplicate requested permission is rejected
- **WHEN** the agent shell is started with duplicate requested permissions
- **THEN** it exits with usage guidance before sending any authorization request

#### Scenario: Invalid identifier option is rejected
- **WHEN** the agent shell is started with malformed session, peer, device, or pairing identifiers
- **THEN** it exits with usage guidance before connecting to the relay

#### Scenario: Invalid display name option is rejected
- **WHEN** the agent shell is started with an empty, whitespace-only, or oversized `--name` value
- **THEN** it exits with usage guidance before connecting to the relay

#### Scenario: Blank token option is rejected
- **WHEN** the agent shell is started with an empty or whitespace-only `--token` value
- **THEN** it exits with usage guidance before connecting to the relay

#### Scenario: Oversized workflow timer option is rejected
- **WHEN** the agent shell is started with a workflow delay beyond the safe timer bound
- **THEN** it exits with usage guidance before scheduling the timer

#### Scenario: Invalid lifecycle reason option is rejected
- **WHEN** the agent shell is started with blank or oversized lifecycle reason text
- **THEN** it exits with usage guidance before connecting to the relay

#### Scenario: Blank audit log path option is rejected
- **WHEN** the agent shell is started with an empty or whitespace-only `--audit-log` value
- **THEN** it exits with usage guidance before creating an audit sink

#### Scenario: Valid omitted options keep safe defaults
- **WHEN** the agent shell is started with only a valid role
- **THEN** it defaults to no requested permissions, no host approval, no visible session, no relay token, and no audit log path
