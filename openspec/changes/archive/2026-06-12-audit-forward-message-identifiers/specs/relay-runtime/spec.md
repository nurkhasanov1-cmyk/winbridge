## ADDED Requirements

### Requirement: Forwarded message identifier audit metadata
The relay runtime SHALL include the parsed protocol `messageId` in accepted `relay.message.forwarded` audit detail after protocol validation and before audit persistence, and MUST NOT include raw protocol payload contents or user display metadata in that accepted forward audit record.

#### Scenario: Forwarded message audit includes message identifier
- **WHEN** the relay forwards a schema-valid peer message
- **THEN** the accepted forward audit record detail includes `messageType`, `messageId`, `recipientPeerId`, and `recipientRole`

#### Scenario: Forwarded signal audit includes message and authorization identifiers
- **WHEN** the relay forwards a schema-valid `signal` message with a valid top-level payload `authorizationId`
- **THEN** the accepted forward audit record detail includes `messageType`, `messageId`, `authorizationId`, `recipientPeerId`, and `recipientRole`

#### Scenario: Forwarded message identifier audit remains payload-safe
- **WHEN** the relay audits an accepted forwarded message
- **THEN** the audit record detail MUST NOT include raw protocol payloads, display names, private reasons, SDP, ICE candidates, payload markers, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets
