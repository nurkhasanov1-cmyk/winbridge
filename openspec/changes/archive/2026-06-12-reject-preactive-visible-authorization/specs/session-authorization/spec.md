# session-authorization Delta

## MODIFIED Requirements

### Requirement: Visible active session gate
The system SHALL authorize sensitive remote actions only when the session is active, unexpired, explicitly visible to the host, and includes the requested permission. Pending and approved authorizations MUST NOT report host visible active-session state before activation.

#### Scenario: Approved but not visible
- **GIVEN** a host has approved a request but the session is not visible to the host
- **WHEN** a remote action is checked
- **THEN** the system denies the action

#### Scenario: Active and visible with permission
- **GIVEN** an authorization is active, visible to the host, unexpired, and includes `screen:view`
- **WHEN** `screen:view` is checked
- **THEN** the system authorizes the action

#### Scenario: Pending authorization reports visible state
- **WHEN** a pending authorization record reports `visibleToHost` as true
- **THEN** the schema rejects the record before any remote action check can use it

#### Scenario: Approved authorization reports visible state
- **WHEN** an approved authorization record reports `visibleToHost` as true
- **THEN** the schema rejects the record because host visibility only applies after activation

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

#### Scenario: Pre-active authorization is visible
- **WHEN** a pending or approved authorization record reports host visible state
- **THEN** the schema rejects the record so pre-active consent cannot be confused with an active visible session

#### Scenario: Lifecycle state lacks required timestamp
- **WHEN** a denied, approved, active, paused, revoked, terminated, or expired authorization record lacks its corresponding lifecycle timestamp
- **THEN** the schema rejects the record so authorization history remains auditable

#### Scenario: Active authorization resumed from pause lacks resume timestamp
- **WHEN** an active authorization record includes a prior pause timestamp but lacks a resume timestamp
- **THEN** the schema rejects the record so host resume remains explicit and auditable

#### Scenario: Authorization has resume timestamp without prior pause
- **WHEN** an authorization record includes a resume timestamp without a prior pause timestamp
- **THEN** the schema rejects the record as an invalid lifecycle history
