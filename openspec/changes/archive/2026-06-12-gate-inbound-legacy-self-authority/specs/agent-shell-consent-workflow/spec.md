## MODIFIED Requirements

### Requirement: Inbound workflow self-authority boundary
The agent shell SHALL ignore decoded inbound legacy consent decisions, authorization lifecycle messages, and audit workflow messages that identify the local runtime peer as the authority actor before emitting local `received` protocol events or received workflow summary logs.

#### Scenario: Self-origin legacy host consent decision is ignored
- **WHEN** a host shell receives a decoded legacy `host-consent-decision` whose `hostPeerId` equals the local host peer id
- **THEN** the shell MUST NOT emit a local `received` protocol event for that ignored message
- **AND** the shell MUST NOT log a received workflow summary for that ignored message

#### Scenario: Self-origin authorization decision is ignored
- **WHEN** a host shell receives a decoded `session-authorization-decision` whose `hostPeerId` equals the local host peer id
- **THEN** the shell MUST NOT emit a local `received` protocol event for that ignored message
- **AND** the shell MUST NOT log a received workflow summary for that ignored message

#### Scenario: Self-origin actor workflow messages are ignored
- **WHEN** a host shell receives a decoded `session-authorization-state`, `session-control`, `permission-revoked`, or `audit-event` whose `actorPeerId` equals the local host peer id
- **THEN** the shell MUST NOT emit a local `received` protocol event for that ignored message
- **AND** the shell MUST NOT log a received workflow summary for that ignored message

#### Scenario: Ignored self-authority input remains secret-safe
- **WHEN** the shell ignores a decoded inbound workflow authority message because of local peer authority metadata
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, authorization ids, audit ids, workflow actions, tokens, pairing codes, private reasons, signal payloads, keystrokes, screenshots, screen contents, or input contents
