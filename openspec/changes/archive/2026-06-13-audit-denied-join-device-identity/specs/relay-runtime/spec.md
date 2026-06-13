## ADDED Requirements

### Requirement: Denied join device identity audit attribution
The relay runtime SHALL include bounded attempted device identity metadata in `relay.peer.join.denied` audit detail when a schema-valid `join-session` message with schema-valid `deviceIdentity` is denied before registration. Denied join identity metadata MUST remain audit-only and MUST NOT register the peer, consume pairing material, approve a session, activate host visibility, grant permissions, start capture, send input, reconnect a peer, or bypass consent workflows. Denied join audit metadata MUST NOT include raw display names, raw pairing codes, tokens, credentials, protocol payloads, keystrokes, screenshots, screen contents, permissions, authorization identifiers, or full secrets.

#### Scenario: Denied viewer join includes bounded attempted identity
- **WHEN** a viewer join with schema-valid device identity is denied before registration because pairing credentials do not match
- **THEN** the denied join audit detail includes `attemptedDeviceIdentity.deviceId`, `attemptedDeviceIdentity.platform`, `attemptedDeviceIdentity.trustLevel`, and `attemptedDeviceIdentity.createdAt`
- **AND** the denied join audit detail MUST NOT include the viewer display name or raw pairing code

#### Scenario: Denied join redacts device id containing pairing code
- **WHEN** a denied join's schema-valid device identity has a `deviceId` containing the submitted pairing code
- **THEN** the denied join audit detail MUST NOT include the raw attempted `deviceId`
- **AND** the denied join audit detail includes bounded redaction metadata for that attempted `deviceId`
- **AND** the raw submitted pairing code MUST NOT appear anywhere in the audit record

#### Scenario: Denied identity attribution does not authorize remote actions
- **WHEN** a denied join audit record includes attempted device identity metadata
- **THEN** the relay treats the metadata as denial attribution only
- **AND** the metadata MUST NOT register the peer, consume pairing material, approve a session, activate host visibility, grant permissions, start capture, send input, reconnect a peer, or bypass consent workflows
