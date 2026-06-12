## MODIFIED Requirements

### Requirement: Agent shell CLI argument validation
The agent shell SHALL reject malformed, unknown, or ambiguous CLI arguments before starting the runtime, including duplicate requested permissions. Relay URLs MUST NOT contain embedded credentials/userinfo, and relay shared-token values MUST be supplied through `--token` rather than embedded in `--relay` URLs. CLI token values MUST be non-blank, already trimmed, 1024 UTF-8 bytes or less, and contain no ASCII control characters. CLI audit log path values MUST be non-blank and already trimmed. Workflow timer validation SHALL include `--disconnect-after-ms`.

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
- **WHEN** the agent shell is started with an empty, whitespace-only, untrimmed, or oversized `--name` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Malformed token option is rejected
- **WHEN** the agent shell is started with an empty, whitespace-only, untrimmed, control-character, or oversized `--token` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Oversized workflow timer option is rejected
- **WHEN** the agent shell is started with `--authorization-ttl-ms`, `--revoke-after-ms`, `--pause-after-ms`, `--resume-after-ms`, `--terminate-after-ms`, or `--disconnect-after-ms` above the safe timer delay bound
- **THEN** it exits through bounded usage handling before connecting to the relay or scheduling workflow timers

#### Scenario: Invalid lifecycle reason option is rejected
- **WHEN** the agent shell is started with a blank, untrimmed, or oversized lifecycle reason option
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Blank audit log path option is rejected
- **WHEN** the agent shell is started with an empty or whitespace-only `--audit-log` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Untrimmed audit log path option is rejected
- **WHEN** the agent shell is started with a `--audit-log` value containing leading or trailing whitespace
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Valid omitted options keep safe defaults
- **WHEN** the agent shell is started with only a valid role
- **THEN** omitted consent-sensitive options keep fail-closed defaults such as no requested permissions, no host decision, and no visible session

#### Scenario: CLI parses disconnect simulation delay
- **WHEN** the agent shell is started with a valid `--disconnect-after-ms` value
- **THEN** it constructs a matching bounded runtime disconnect delay option
