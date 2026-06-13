## ADDED Requirements

### Requirement: Relay audit redacts separator-form secret identifiers
The relay runtime SHALL treat schema-valid protocol identifiers as secret-bearing audit identifiers when token, credential, cookie, API key, access key, private key, SSH key, authorization header, or auth header marker families appear across identifier punctuation separators such as `.`, `_`, `-`, or `:`. Redaction MUST apply before writing top-level audit `sessionId`, relay actor ids, join device identity metadata, and forwarded recipient peer metadata. This redaction MUST remain audit-only and MUST NOT change peer registration, room lookup, pairing ticket creation or consumption, forwarding, consent, authorization, capture, input, reconnect, or disconnect behavior.

#### Scenario: Accepted join redacts separator-form session and peer identifiers
- **WHEN** a peer joins with schema-valid `sessionId` or `peerId` values containing secret marker families separated by allowed identifier punctuation
- **THEN** the accepted join audit record MUST NOT include those raw identifiers in top-level `sessionId`, relay actor id, or detail metadata
- **AND** the join outcome and room membership semantics remain unchanged

#### Scenario: Join device identity redacts separator-form device id
- **WHEN** an accepted or denied join includes schema-valid `deviceIdentity.deviceId` with secret marker families separated by allowed identifier punctuation
- **THEN** the join audit detail MUST NOT include the raw `deviceId`
- **AND** the join audit detail includes bounded redaction metadata for that device id

#### Scenario: Forwarded recipient audit redacts separator-form recipient peer id
- **WHEN** the relay forwards a schema-valid peer message to a registered recipient whose peer id contains secret marker families separated by allowed identifier punctuation
- **THEN** the accepted forward audit detail MUST NOT include the raw recipient peer id
- **AND** the peer message is still forwarded according to the existing room and targeting rules
