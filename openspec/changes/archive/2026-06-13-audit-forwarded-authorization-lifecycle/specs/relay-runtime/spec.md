## ADDED Requirements

### Requirement: Forwarded authorization lifecycle audit metadata
The relay runtime SHALL include the non-secret top-level `authorizationId` in accepted `relay.message.forwarded` audit detail when forwarding schema-valid authorization lifecycle messages that carry an authorization identifier. The accepted forward audit record MUST remain payload-safe and MUST NOT include raw reasons, granted permissions, revoked permissions, audit-event detail fields, display names, tokens, pairing codes, signal payload contents, remote content, or full protocol payloads.

#### Scenario: Forwarded authorization decision audit includes authorization identifier
- **WHEN** the relay forwards a schema-valid `session-authorization-decision`
- **THEN** the accepted forward audit record detail includes `messageType`, `messageId`, `authorizationId`, `recipientPeerId`, and `recipientRole`

#### Scenario: Forwarded authorization state audit includes authorization identifier
- **WHEN** the relay forwards a schema-valid `session-authorization-state`
- **THEN** the accepted forward audit record detail includes `messageType`, `messageId`, `authorizationId`, `recipientPeerId`, and `recipientRole`

#### Scenario: Forwarded permission revocation audit includes authorization identifier
- **WHEN** the relay forwards a schema-valid `permission-revoked`
- **THEN** the accepted forward audit record detail includes `messageType`, `messageId`, `authorizationId`, `recipientPeerId`, and `recipientRole`

#### Scenario: Forwarded session control audit includes authorization identifier
- **WHEN** the relay forwards a schema-valid `session-control`
- **THEN** the accepted forward audit record detail includes `messageType`, `messageId`, `authorizationId`, `recipientPeerId`, and `recipientRole`

#### Scenario: Forwarded authorization lifecycle audit omits sensitive lifecycle metadata
- **WHEN** the relay audits an accepted forwarded authorization lifecycle message with private reason text, grant scope, revoked permission, or control metadata
- **THEN** the accepted forward audit record detail MUST NOT include raw reasons, granted permissions, revoked permissions, control reasons, display names, tokens, pairing codes, protocol payloads, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets
