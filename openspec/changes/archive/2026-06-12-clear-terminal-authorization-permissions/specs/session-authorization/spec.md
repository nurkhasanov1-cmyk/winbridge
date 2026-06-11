# session-authorization Delta

## MODIFIED Requirements

### Requirement: Revoke and terminate fail closed
The system SHALL immediately deny remote action checks after host denial, host revocation, permission revocation, expiration, or session termination. Terminal authorization records with status `denied`, `revoked`, `terminated`, or `expired` MUST NOT carry permissions.

#### Scenario: Request is denied
- **WHEN** the host denies a pending request
- **THEN** the authorization is marked `denied`, its permissions are cleared, and remote action checks fail immediately

#### Scenario: Permission is revoked
- **WHEN** the host revokes a granted permission
- **THEN** action checks for that permission fail immediately

#### Scenario: Session is terminated
- **WHEN** the host terminates the session
- **THEN** the authorization is marked `terminated`, its permissions are cleared, and all remote action checks fail immediately

#### Scenario: Authorization expires
- **WHEN** an authorization reaches its expiration time
- **THEN** the authorization is marked `expired`, its permissions are cleared, and all remote action checks fail immediately

### Requirement: Schema-level authorization record invariants
The system SHALL reject malformed session authorization records during schema parsing before any remote action authorization check can use them.

#### Scenario: Duplicate permissions are parsed
- **WHEN** a session authorization record includes duplicate permissions
- **THEN** the schema rejects the record so grant scope and audit metadata remain unambiguous

#### Scenario: Grant-bearing state has no permissions
- **WHEN** a pending, approved, active, or paused authorization record has no permissions
- **THEN** the schema rejects the record before it can represent a usable remote assistance grant

#### Scenario: Terminal state carries permissions
- **WHEN** a denied, revoked, terminated, or expired authorization record has permissions
- **THEN** the schema rejects the record so fail-closed states cannot carry usable grant scope

#### Scenario: Terminal state has no permissions
- **WHEN** a denied, revoked, terminated, or expired authorization record has an empty permission list
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

