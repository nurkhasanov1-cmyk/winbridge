## ADDED Requirements

### Requirement: Inbound self-authority boundary
The agent shell SHALL ignore decoded inbound authorization requests that identify the local peer as the remote viewer before emitting local `received` protocol events or running consent workflow handling.

#### Scenario: Self-referential authorization request is ignored
- **WHEN** a host shell receives a decoded `session-authorization-request` whose `viewerPeerId` equals the local host peer id
- **THEN** the shell MUST NOT send a host authorization decision, authorization state update, or workflow audit-event for that request
- **AND** the shell MUST NOT emit a local `received` protocol event for that ignored request

#### Scenario: Ignored self-authority input remains secret-safe
- **WHEN** the shell ignores a decoded authorization request that identifies the local peer as the requester
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, peer ids, tokens, pairing codes, private reasons, signal payloads, keystrokes, screenshots, screen contents, or input contents
