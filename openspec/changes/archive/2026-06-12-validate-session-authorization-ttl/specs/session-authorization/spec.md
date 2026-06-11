## MODIFIED Requirements

### Requirement: Consent-bound lifecycle
The system SHALL model remote assistance authorization as an explicit lifecycle that begins pending and cannot become active without host approval, and SHALL reject malformed or unsafe pending authorization TTL inputs before creating authorization records.

#### Scenario: Session request is created
- **WHEN** a viewer requests remote assistance
- **THEN** the system creates a pending authorization state without granting remote permissions

#### Scenario: Host denies request
- **WHEN** the host denies a pending request
- **THEN** the system marks the authorization denied and remote action checks fail closed

#### Scenario: Pending authorization TTL is omitted
- **WHEN** pending authorization is created without an explicit TTL
- **THEN** the system uses the default pending authorization expiration window

#### Scenario: Pending authorization TTL is malformed
- **WHEN** pending authorization is created with a fractional, negative, zero, non-finite, or timer-unsafe TTL value
- **THEN** the system rejects the request before creating an authorization record
