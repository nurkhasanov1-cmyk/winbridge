## ADDED Requirements

### Requirement: Schema-level authorization record invariants
The system SHALL reject malformed session authorization records during schema parsing before any remote action authorization check can use them.

#### Scenario: Duplicate permissions are parsed
- **WHEN** a session authorization record includes duplicate permissions
- **THEN** the schema rejects the record so grant scope and audit metadata remain unambiguous

#### Scenario: Grant-bearing state has no permissions
- **WHEN** a pending, approved, active, or paused authorization record has no permissions
- **THEN** the schema rejects the record before it can represent a usable remote assistance grant

#### Scenario: Revoked state has no permissions
- **WHEN** a revoked authorization record has no remaining permissions
- **THEN** the schema accepts the record as a terminal fail-closed state

#### Scenario: Active authorization is not visible
- **WHEN** an active authorization record is not visible to the host
- **THEN** the schema rejects the record before any remote action check can authorize it

#### Scenario: Paused authorization is not visible
- **WHEN** a paused authorization record is not visible to the host
- **THEN** the schema rejects the record so host pause cannot be represented as hidden remote access

#### Scenario: Lifecycle state lacks required timestamp
- **WHEN** a denied, approved, active, paused, revoked, terminated, or expired authorization record lacks its corresponding lifecycle timestamp
- **THEN** the schema rejects the record so authorization history remains auditable

#### Scenario: Active authorization resumed from pause lacks resume timestamp
- **WHEN** an active authorization record includes a prior pause timestamp but lacks a resume timestamp
- **THEN** the schema rejects the record so host resume remains explicit and auditable

#### Scenario: Authorization has resume timestamp without prior pause
- **WHEN** an authorization record includes a resume timestamp without a prior pause timestamp
- **THEN** the schema rejects the record as an invalid lifecycle history
