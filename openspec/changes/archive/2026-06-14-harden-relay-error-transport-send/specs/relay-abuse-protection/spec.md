## ADDED Requirements

### Requirement: Transport-independent rejection accounting
The relay SHALL record invalid-message audit events and apply invalid-message rate-limit accounting for rejected messages even when the sender WebSocket is already closing or cannot accept a peer-facing `relay-error` response. Failed `relay-error` delivery MUST NOT forward the rejected message, grant permissions, start capture, send input, suppress host visibility, bypass consent workflows, or suppress required rejection audit and rate-limit accounting.

#### Scenario: Rejection accounting survives closed sender transport
- **WHEN** a relay message is rejected while the sender WebSocket is no longer open for sending a `relay-error`
- **THEN** the relay records the secret-safe rejection audit event and applies invalid-message rate-limit accounting
- **AND** the rejected message is not forwarded to another peer

#### Scenario: Relay-error send failure remains non-authorizing
- **WHEN** a relay-owned `relay-error` response cannot be delivered because the sender transport is closing
- **THEN** that delivery failure MUST NOT approve sessions, grant permissions, start capture, send input, reconnect peers, suppress host visibility, or bypass consent workflows
