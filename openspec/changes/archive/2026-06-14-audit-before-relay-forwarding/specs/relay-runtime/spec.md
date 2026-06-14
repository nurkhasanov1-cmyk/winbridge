## ADDED Requirements

### Requirement: Accepted forward audit precedes recipient delivery
The relay runtime SHALL write the accepted `relay.message.forwarded` audit record before delivering a validated registered peer message to the remaining room peer. If the accepted-forward audit write fails, the relay MUST NOT deliver the original peer message to the recipient and MUST keep peer-facing diagnostics and rejection audit metadata bounded and secret-safe.

#### Scenario: Accepted forward audit succeeds before delivery
- **WHEN** a registered peer sends a schema-valid message that passes relay role, session, target, and recipient checks
- **THEN** the relay writes the accepted `relay.message.forwarded` audit record before delivering the message to the recipient
- **AND** the successful recipient-visible protocol envelope remains unchanged

#### Scenario: Accepted forward audit failure blocks delivery
- **WHEN** the relay cannot write the accepted `relay.message.forwarded` audit record for a validated registered peer message
- **THEN** the relay rejects the sender's message before recipient delivery
- **AND** the remaining peer receives no forwarded copy of that message
- **AND** relay diagnostics and rejection audit metadata MUST NOT expose raw protocol payloads, display names, private reasons, SDP, ICE candidates, payload markers, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets

#### Scenario: Forward audit ordering remains non-authorizing
- **WHEN** the relay writes accepted-forward audit metadata before delivery
- **THEN** the audit ordering MUST NOT approve authorization, activate host visibility, grant permissions, start capture, send input, reconnect peers, suppress host visibility, expose clipboard, transfer files, expose diagnostics, install services, configure startup persistence, collect credentials, hide the session from the host, or bypass consent workflows
