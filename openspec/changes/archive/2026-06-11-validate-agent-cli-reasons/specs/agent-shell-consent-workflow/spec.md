## MODIFIED Requirements

### Requirement: Agent shell CLI argument validation
The agent shell SHALL reject malformed, unknown, or ambiguous CLI arguments before starting the runtime.

#### Scenario: Unknown CLI option is rejected
- **WHEN** the agent shell is started with an option name that is not part of the documented CLI
- **THEN** it exits through bounded usage handling before connecting to the relay

#### Scenario: Visible session value is explicit
- **WHEN** the agent shell is started with `--visible-session`
- **THEN** the value MUST be either `true` or `false`

#### Scenario: Invalid permission option is rejected
- **WHEN** the agent shell is started with an invalid requested or revocation permission value
- **THEN** it exits through bounded usage handling before sending any protocol message

#### Scenario: Invalid identifier option is rejected
- **WHEN** the agent shell is started with a malformed `--session`, `--peer`, or `--device` identifier
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Invalid lifecycle reason option is rejected
- **WHEN** the agent shell is started with a blank or oversized lifecycle reason option
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Valid omitted options keep safe defaults
- **WHEN** the agent shell is started with only a valid role
- **THEN** omitted consent-sensitive options keep fail-closed defaults such as no requested permissions, no host decision, and no visible session
