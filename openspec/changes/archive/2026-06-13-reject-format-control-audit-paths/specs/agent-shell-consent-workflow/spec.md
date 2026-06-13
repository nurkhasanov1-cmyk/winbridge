## MODIFIED Requirements

### Requirement: Agent shell CLI argument validation
The agent shell SHALL reject malformed, unknown, or ambiguous CLI arguments before starting the runtime, including duplicate requested permissions and requested permission entries that are not exact canonical permission tokens. Relay URLs MUST NOT contain embedded credentials/userinfo, canonical `token` query parameters, or case-variant `token` query parameters, and relay shared-token values MUST be supplied through `--token` rather than embedded in `--relay` URLs. CLI display name values MUST be non-blank, already trimmed, 120 characters or less, contain no ASCII control characters, and contain no Unicode bidirectional formatting controls. CLI token values MUST be non-blank, already trimmed, 1024 UTF-8 bytes or less, contain no ASCII control characters, contain no Unicode bidirectional formatting controls, and contain no zero-width formatting controls. CLI audit log path values MUST be non-blank, already trimmed, 1024 UTF-8 bytes or less, contain no ASCII control characters, contain no Unicode bidirectional formatting controls, and contain no zero-width formatting controls. Authorization TTL validation SHALL require `--authorization-ttl-ms` values to be positive integers from `1` through the safe timer delay bound. Host consent timeout validation SHALL require `--host-consent-timeout-ms` values to be exact positive integers from `1` through the safe timer delay bound and only allow them with `--host-consent-prompt true`. Lifecycle workflow timer validation SHALL allow `--revoke-after-ms`, `--pause-after-ms`, `--resume-after-ms`, `--terminate-after-ms`, and `--disconnect-after-ms` values from `0` through the safe timer delay bound.

#### Scenario: Malformed host consent timeout option is rejected
- **WHEN** the agent shell is started with a zero, fractional, negative, non-finite, timer-unsafe, or prompt-disabled `--host-consent-timeout-ms` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

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
- **WHEN** the agent shell is started with a `--relay` value containing a canonical `token` query parameter or a case-variant `token` query parameter such as `Token` or `TOKEN`
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Visible session value is explicit
- **WHEN** the agent shell is started with `--visible-session`
- **THEN** the value MUST be either `true` or `false`

#### Scenario: Invalid permission option is rejected
- **WHEN** the agent shell is started with an invalid requested or revocation permission value
- **THEN** it exits through bounded usage handling before sending any protocol message

#### Scenario: Whitespace-padded requested permission is rejected
- **WHEN** the agent shell is started with `--request` containing a requested permission entry with leading or trailing whitespace
- **THEN** it exits through bounded usage handling before connecting to the relay or sending a session authorization request

#### Scenario: Duplicate requested permission is rejected
- **WHEN** the agent shell is started with the same requested permission more than once
- **THEN** it exits through bounded usage handling before connecting to the relay or sending a session authorization request

#### Scenario: Invalid identifier option is rejected
- **WHEN** the agent shell is started with a malformed `--session`, `--peer`, or `--device` identifier
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Invalid display name option is rejected
- **WHEN** the agent shell is started with an empty, whitespace-only, untrimmed, control-character, bidi-control, or oversized `--name` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Malformed token option is rejected
- **WHEN** the agent shell is started with an empty, whitespace-only, untrimmed, control-character, Unicode bidirectional formatting control, zero-width formatting control, or oversized `--token` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Zero authorization TTL option is rejected
- **WHEN** the agent shell is started with `--authorization-ttl-ms 0`
- **THEN** it exits through bounded usage handling before connecting to the relay, sending any protocol message, or scheduling workflow timers

#### Scenario: Oversized workflow timer option is rejected
- **WHEN** the agent shell is started with `--authorization-ttl-ms`, `--revoke-after-ms`, `--pause-after-ms`, `--resume-after-ms`, `--terminate-after-ms`, or `--disconnect-after-ms` above the safe timer delay bound
- **THEN** it exits through bounded usage handling before connecting to the relay or scheduling workflow timers

#### Scenario: Zero lifecycle simulation delay remains valid
- **WHEN** the agent shell is started with `--revoke-after-ms 0`, `--pause-after-ms 0`, `--resume-after-ms 0`, `--terminate-after-ms 0`, or `--disconnect-after-ms 0`
- **THEN** it constructs matching bounded runtime lifecycle delay options without weakening the authorization TTL requirement

#### Scenario: Invalid lifecycle reason option is rejected
- **WHEN** the agent shell is started with a blank, untrimmed, or oversized lifecycle reason option
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Blank audit log path option is rejected
- **WHEN** the agent shell is started with an empty or whitespace-only `--audit-log` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Untrimmed audit log path option is rejected
- **WHEN** the agent shell is started with a `--audit-log` value containing leading or trailing whitespace
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Control-character audit log path option is rejected
- **WHEN** the agent shell is started with a `--audit-log` value containing an ASCII control character or `WINBRIDGE_AGENT_AUDIT_LOG_PATH` contains an ASCII control character
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message
- **AND** stderr output MUST NOT include the raw configured path value

#### Scenario: Format-control audit log path option is rejected
- **WHEN** the agent shell is started with a `--audit-log` value containing a Unicode bidirectional or zero-width formatting control or `WINBRIDGE_AGENT_AUDIT_LOG_PATH` contains a Unicode bidirectional or zero-width formatting control
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message
- **AND** stderr output MUST NOT include the raw configured path value

#### Scenario: Oversized audit log path option is rejected
- **WHEN** the agent shell is started with a `--audit-log` value whose UTF-8 byte length exceeds 1024 bytes or `WINBRIDGE_AGENT_AUDIT_LOG_PATH` exceeds 1024 UTF-8 bytes
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message
- **AND** stderr output MUST NOT include the raw configured path value

#### Scenario: Valid omitted options keep safe defaults
- **WHEN** the agent shell is started with only a valid role
- **THEN** omitted consent-sensitive options keep fail-closed defaults such as no requested permissions, no host decision, and no visible session

#### Scenario: CLI parses disconnect simulation delay
- **WHEN** the agent shell is started with a valid `--disconnect-after-ms` value
- **THEN** it constructs a matching bounded runtime disconnect delay option
