## ADDED Requirements

### Requirement: Device identity rejects secret-bearing display names
The identity layer SHALL reject device identity display names that contain secret-bearing metadata before treating the identity as trusted peer metadata. Secret-bearing metadata MUST include raw token, credential, password, passphrase, pairing-code, API-key, authorization-header, auth-header, cookie, private-key, SSH-key, keystroke, screenshot, screen-data, screen-content, clipboard-content, file-transfer content/data/bytes, diagnostics content/dump, or secret markers when they appear with values. Rejection diagnostics MUST NOT expose the raw display-name text.

#### Scenario: Device identity display name contains secret-bearing metadata
- **WHEN** a peer sends device identity metadata whose display name contains secret-bearing metadata
- **THEN** the receiver rejects the malformed metadata without treating the peer as authenticated
- **AND** the rejection does not expose the raw display-name text

#### Scenario: Safe device identity display name remains accepted
- **WHEN** a peer sends device identity metadata with a concise non-secret display name
- **THEN** the identity schema accepts the display name when all other identity metadata is valid
