## ADDED Requirements

### Requirement: Host workflow audit-event simulation
The host shell SHALL emit secret-safe development `audit-event` protocol messages for explicit host authorization decisions, visible activation, and permission revocation simulation.

#### Scenario: Host approval audit event
- **WHEN** the host shell explicitly approves an authorization request
- **THEN** it sends an `audit-event` with accepted outcome and safe approval metadata

#### Scenario: Host denial audit event
- **WHEN** the host shell explicitly denies an authorization request
- **THEN** it sends an `audit-event` with denied outcome and safe denial metadata

#### Scenario: Visible activation audit event
- **WHEN** the host shell emits active visible session state
- **THEN** it sends an `audit-event` with accepted outcome and visible host metadata

#### Scenario: Permission revoke audit event
- **WHEN** the host shell sends a configured permission revocation
- **THEN** it sends an `audit-event` with accepted outcome, revoked permission identifier, and remaining permission count

#### Scenario: Agent shell audit-event details are secret-safe
- **WHEN** the host shell sends development audit-event messages
- **THEN** audit details MUST NOT contain raw tokens, raw pairing codes, credentials, display names, signal payloads, keystrokes, screenshots, screen contents, or raw denial/revocation reason text
