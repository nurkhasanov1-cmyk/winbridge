## ADDED Requirements

### Requirement: Legacy consent request display names remain canonical
The protocol SHALL reject legacy `host-consent-required` messages whose `viewerDisplayName` is not already trimmed before consent UI or workflow code can rely on that metadata.

#### Scenario: Legacy consent request display name is untrimmed
- **WHEN** a `host-consent-required` message has a `viewerDisplayName` with leading or trailing whitespace
- **THEN** the protocol schema rejects the message before it can be forwarded or processed

#### Scenario: Rejected legacy display name grants no access
- **WHEN** a legacy consent request display name is rejected
- **THEN** the message MUST NOT approve authorization, activate host visibility, grant permissions, start capture, send input, reconnect a peer, or bypass consent workflows
