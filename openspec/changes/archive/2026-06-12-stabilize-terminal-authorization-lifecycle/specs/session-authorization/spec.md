## MODIFIED Requirements

### Requirement: Revoke and terminate fail closed
The system SHALL immediately deny remote action checks after host denial, host revocation, permission revocation, expiration, or session termination. Terminal authorization records with status `denied`, `revoked`, `terminated`, or `expired` MUST NOT carry permissions. Terminal authorization status and lifecycle metadata MUST remain stable after a record reaches `denied`, `revoked`, `terminated`, or `expired`. Session termination SHALL only transition visible, unexpired `active` or `paused` authorizations.

#### Scenario: Request is denied
- **WHEN** the host denies a pending request
- **THEN** the authorization is marked `denied`, its permissions are cleared, and remote action checks fail immediately

#### Scenario: Permission is revoked
- **WHEN** the host revokes a granted permission
- **THEN** action checks for that permission fail immediately

#### Scenario: Session is terminated
- **WHEN** the host terminates a visible unexpired active or paused session
- **THEN** the authorization is marked `terminated`, its permissions are cleared, and all remote action checks fail immediately

#### Scenario: Authorization expires
- **WHEN** an authorization reaches its expiration time
- **THEN** the authorization is marked `expired`, its permissions are cleared, and all remote action checks fail immediately

#### Scenario: Terminal status survives later expiration checks
- **WHEN** a denied, revoked, terminated, or already expired authorization is checked after its expiration time
- **THEN** the system preserves the existing terminal status, lifecycle timestamp, and reason while remote action checks remain denied

#### Scenario: Termination rejects unsafe lifecycle state
- **WHEN** session termination is attempted for a pending, approved, denied, revoked, terminated, expired, invisible, or expired live authorization
- **THEN** the system rejects the transition and does not create or restore remote action access
