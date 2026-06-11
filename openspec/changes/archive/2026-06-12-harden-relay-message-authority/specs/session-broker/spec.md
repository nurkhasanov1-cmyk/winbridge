## ADDED Requirements

### Requirement: Registered peer message authority
The relay SHALL reject registered-peer messages before forwarding when the message is join-only, relay-originated, declares a sender or actor peer id different from the registered peer, or uses a role-bound authorization field that does not match the registered peer role.

#### Scenario: Registered peer replays join message
- **WHEN** a registered peer sends a `join-session` message as an ordinary peer message
- **THEN** the relay rejects the message before forwarding it and MUST NOT expose the pairing credential to the remaining peer

#### Scenario: Peer forges relay-only message
- **WHEN** a registered peer sends a `relay-ready` or `peer-disconnected` message as an ordinary peer message
- **THEN** the relay rejects the message before forwarding it to the remaining peer

#### Scenario: Peer spoofs another sender
- **WHEN** a registered peer sends a peer-originated message whose sender or actor peer id identifies a different peer
- **THEN** the relay rejects the message before forwarding it and MUST NOT treat it as trusted remote-assistance data

#### Scenario: Peer sends role-mismatched authorization message
- **WHEN** a registered host sends a viewer-originated authorization request or a registered viewer sends a host-originated authorization decision
- **THEN** the relay rejects the message before forwarding it

#### Scenario: Registered peer authority rejection is secret-safe
- **WHEN** the relay rejects a registered-peer message authority violation
- **THEN** the peer-facing relay error and audit reason MUST use bounded metadata-only text and MUST NOT include raw pairing codes, tokens, credentials, protocol payloads, keystrokes, screenshots, screen contents, or full secrets
