## ADDED Requirements

### Requirement: Inbound self-disconnect boundary
The agent shell SHALL ignore decoded inbound `peer-disconnected` messages whose `peerId` equals the local runtime peer before emitting local `received` protocol events or recording remote peer disconnected state.

#### Scenario: Self-disconnect notice is ignored
- **WHEN** a host shell receives a decoded `peer-disconnected` message whose `peerId` equals the local host peer id
- **THEN** the shell MUST NOT record remote peer disconnected state because of that message
- **AND** the shell MUST NOT emit a local `received` protocol event for that ignored message

#### Scenario: Ignored self-disconnect input remains secret-safe
- **WHEN** the shell ignores a decoded `peer-disconnected` message that identifies the local peer
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, tokens, pairing codes, private reasons, signal payloads, keystrokes, screenshots, screen contents, or input contents
