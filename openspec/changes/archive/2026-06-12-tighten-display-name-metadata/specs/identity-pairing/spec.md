## ADDED Requirements

### Requirement: Device identity display names remain canonical
The system SHALL reject device identity display-name metadata that is not already trimmed before treating it as trusted identity or pairing metadata.

#### Scenario: Device identity display name is untrimmed
- **WHEN** a peer sends device identity metadata with a display name that has leading or trailing whitespace
- **THEN** the receiver rejects the malformed metadata without treating the peer as authenticated

#### Scenario: Device identity display-name rejection remains non-authorizing
- **WHEN** device identity display-name metadata is rejected
- **THEN** the rejection MUST NOT approve a session, activate host visibility, grant permissions, start capture, send input, reconnect a peer, or bypass consent workflows
