## ADDED Requirements

### Requirement: Forwarded message recipient audit metadata
The relay runtime SHALL include secret-safe recipient routing metadata in accepted `relay.message.forwarded` audit detail after selecting a concrete registered recipient, and MUST NOT include raw protocol payload contents or user display metadata in that accepted forward audit record.

#### Scenario: Forwarded message audit includes recipient route
- **WHEN** the relay forwards a schema-valid peer message to the remaining registered recipient
- **THEN** the accepted forward audit record detail includes `messageType`, `recipientPeerId`, and `recipientRole`

#### Scenario: Forwarded signal audit preserves authorization metadata
- **WHEN** the relay forwards a schema-valid `signal` message with a valid top-level payload `authorizationId`
- **THEN** the accepted forward audit record detail includes `messageType`, `authorizationId`, `recipientPeerId`, and `recipientRole`

#### Scenario: Forwarded message audit remains payload-safe
- **WHEN** the relay audits an accepted forwarded message
- **THEN** the audit record detail MUST NOT include raw protocol payloads, display names, private reasons, SDP, ICE candidates, payload markers, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets
