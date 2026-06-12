## MODIFIED Requirements

### Requirement: Managed runtime option validation
The managed agent shell runtime SHALL reject malformed direct runtime options before opening a relay connection, sending protocol messages, scheduling workflow timers, or emitting authorization decisions. Relay URLs MUST NOT contain embedded credentials/userinfo, and relay shared-token values MUST be supplied through the dedicated token field rather than embedded in the relay URL query string. Runtime token values MUST be non-blank, 1024 UTF-8 bytes or less, and contain no ASCII control characters.

#### Scenario: Runtime relay URL is not WebSocket
- **WHEN** the managed runtime is configured with a malformed, relative, or non-WebSocket relay URL
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime relay URL carries credentials
- **WHEN** the managed runtime is configured with a relay URL containing username or password/userinfo credentials
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime relay URL carries token query
- **WHEN** the managed runtime is configured with a relay URL containing a `token` query parameter
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime identity fields are malformed
- **WHEN** the managed runtime is configured with a malformed role, session id, pairing code, peer id, device id, or display name
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime requested permissions are malformed
- **WHEN** the managed runtime is configured with invalid, duplicate, or oversized requested permissions
- **THEN** it fails before connecting to the relay or sending a session authorization request

#### Scenario: Runtime token is malformed
- **WHEN** the managed runtime is configured with an empty, whitespace-only, non-string, control-character, or oversized token
- **THEN** it fails before connecting to the relay or adding the token to a relay URL

#### Scenario: Runtime workflow timer is unsafe
- **WHEN** the managed runtime is configured with a non-integer, negative, or oversized workflow timer delay
- **THEN** it fails before connecting to the relay or scheduling workflow timers

#### Scenario: Runtime visible-session flag is malformed
- **WHEN** the managed runtime is configured with a non-boolean visible-session flag
- **THEN** it fails before connecting to the relay or sending any authorization decision

#### Scenario: Runtime decision or lifecycle reason is malformed
- **WHEN** the managed runtime is configured with a blank or oversized decision or lifecycle reason
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime revoke permission is malformed
- **WHEN** the managed runtime is configured with an invalid revocation permission
- **THEN** it fails before connecting to the relay or scheduling permission revocation

### Requirement: Agent shell CLI argument validation
The agent shell SHALL reject malformed, unknown, or ambiguous CLI arguments before starting the runtime, including duplicate requested permissions. Relay URLs MUST NOT contain embedded credentials/userinfo, and relay shared-token values MUST be supplied through `--token` rather than embedded in `--relay` URLs. CLI token values MUST be non-blank, 1024 UTF-8 bytes or less, and contain no ASCII control characters.

#### Scenario: Unknown CLI option is rejected
- **WHEN** the agent shell is started with an option name that is not part of the documented CLI
- **THEN** it exits through bounded usage handling before connecting to the relay

#### Scenario: Invalid relay URL option is rejected
- **WHEN** the agent shell is started with a malformed, relative, or non-WebSocket `--relay` URL
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Relay URL credentials are rejected
- **WHEN** the agent shell is started with a `--relay` value containing username or password/userinfo credentials
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Relay URL token query is rejected
- **WHEN** the agent shell is started with a `--relay` value containing a `token` query parameter
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Visible session value is explicit
- **WHEN** the agent shell is started with `--visible-session`
- **THEN** the value MUST be either `true` or `false`

#### Scenario: Invalid permission option is rejected
- **WHEN** the agent shell is started with an invalid requested or revocation permission value
- **THEN** it exits through bounded usage handling before sending any protocol message

#### Scenario: Duplicate requested permission is rejected
- **WHEN** the agent shell is started with the same requested permission more than once
- **THEN** it exits through bounded usage handling before connecting to the relay or sending a session authorization request

#### Scenario: Invalid identifier option is rejected
- **WHEN** the agent shell is started with a malformed `--session`, `--peer`, or `--device` identifier
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Invalid display name option is rejected
- **WHEN** the agent shell is started with an empty, whitespace-only, or oversized `--name` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Malformed token option is rejected
- **WHEN** the agent shell is started with an empty, whitespace-only, control-character, or oversized `--token` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Oversized workflow timer option is rejected
- **WHEN** the agent shell is started with `--authorization-ttl-ms`, `--revoke-after-ms`, `--pause-after-ms`, `--resume-after-ms`, or `--terminate-after-ms` above the safe timer delay bound
- **THEN** it exits through bounded usage handling before connecting to the relay or scheduling workflow timers

#### Scenario: Invalid lifecycle reason option is rejected
- **WHEN** the agent shell is started with a blank or oversized lifecycle reason option
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Blank audit log path option is rejected
- **WHEN** the agent shell is started with an empty or whitespace-only `--audit-log` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Valid omitted options keep safe defaults
- **WHEN** the agent shell is started with only a valid role
- **THEN** omitted consent-sensitive options keep fail-closed defaults such as no requested permissions, no host decision, and no visible session
