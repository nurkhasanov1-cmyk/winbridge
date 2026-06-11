# agent-shell-consent-workflow Delta

## MODIFIED Requirements

### Requirement: Managed agent shell lifecycle
The agent shell SHALL expose a managed runtime with explicit start and stop operations for tests and CLI use. It SHALL send `join-session` when the socket opens. It SHALL send `hello` only after the relay indicates a two-peer room or after receiving a peer `hello`, and MUST NOT send `hello` before a relay recipient is available.

#### Scenario: Agent shell starts
- **WHEN** the agent shell runtime starts
- **THEN** it connects to the relay and sends a join message using the same implementation as the CLI

#### Scenario: Hello waits for recipient
- **WHEN** the relay returns `relay-ready` with room size 1
- **THEN** the shell MUST NOT send `hello`

#### Scenario: Hello sent when room is paired
- **WHEN** the relay returns `relay-ready` with room size 2 or the shell receives a peer `hello`
- **THEN** it sends exactly one `hello` for its local peer before later workflow messages that depend on peer presence
- **AND** sending `hello` MUST NOT approve authorization, activate a visible session, grant permissions, start capture, send input, reconnect a peer, suppress host visibility, or bypass consent workflows

