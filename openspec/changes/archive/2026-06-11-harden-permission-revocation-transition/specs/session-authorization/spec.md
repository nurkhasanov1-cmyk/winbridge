## ADDED Requirements

### Requirement: Permission revocation transition safety
The system SHALL allow permission revocation only for visible, unexpired `active` or `paused` authorizations that currently include the revoked permission.

#### Scenario: Active permission is revoked
- **WHEN** the host revokes a permission from a visible active unexpired authorization that contains the permission
- **THEN** the system removes that permission and action checks for that permission fail immediately

#### Scenario: Paused permission is revoked
- **WHEN** the host revokes one permission from a visible paused unexpired authorization that contains multiple permissions
- **THEN** the system removes that permission, keeps the authorization paused, and action checks remain denied until host resume

#### Scenario: Final permission is revoked
- **WHEN** the host revokes the final remaining permission from a visible active or paused authorization
- **THEN** the system marks the authorization `revoked` and all remote action checks fail closed

#### Scenario: Revocation rejects unsafe lifecycle state
- **WHEN** permission revocation is attempted for a pending, approved, denied, revoked, terminated, expired, or invisible authorization
- **THEN** the system rejects the transition and does not create or restore remote action access

#### Scenario: Revocation rejects missing permission
- **WHEN** permission revocation is attempted for a permission that is not present in the authorization grant
- **THEN** the system rejects the transition and does not mutate the grant scope
