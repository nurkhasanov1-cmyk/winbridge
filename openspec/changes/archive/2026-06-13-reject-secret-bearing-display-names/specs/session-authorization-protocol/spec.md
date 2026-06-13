## ADDED Requirements

### Requirement: Legacy consent rejects secret-bearing display names
The protocol SHALL reject legacy host consent request display names that contain secret-bearing metadata before forwarding, consent UI rendering, trusted runtime event emission, workflow processing, or treating the message as authorization-related metadata. Secret-bearing metadata MUST include raw token, credential, password, passphrase, pairing-code, API-key, authorization-header, auth-header, cookie, private-key, SSH-key, keystroke, screenshot, screen-data, screen-content, clipboard-content, file-transfer content/data/bytes, diagnostics content/dump, or secret markers when they appear with values. Rejection diagnostics MUST NOT expose the raw display-name text.

#### Scenario: Legacy consent request display name contains secret-bearing metadata
- **WHEN** a `host-consent-required` message has a `viewerDisplayName` containing secret-bearing metadata
- **THEN** protocol validation rejects the message before consent UI can rely on the viewer metadata
- **AND** the rejection does not expose the raw display-name text

#### Scenario: Safe legacy consent request display name remains accepted
- **WHEN** a `host-consent-required` message uses a concise non-secret `viewerDisplayName`
- **THEN** protocol validation accepts the display name when all other message invariants are valid
