# session-authorization Specification

## Purpose
Defines the consent-bound authorization state machine for visible, scoped, expiring remote assistance permissions.
## Requirements
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

### Requirement: Visible activation gate
The system SHALL activate a remote assistance session only when host consent is approved and the host-visible session indicator is active.

#### Scenario: Approved session lacks visible host indicator
- **WHEN** a host-approved session is activated without visible host session state
- **THEN** the system rejects activation

#### Scenario: Approved session is visible
- **WHEN** a host-approved session is activated with visible host session state
- **THEN** the system marks the authorization active until expiration, revoke, or termination

### Requirement: Scoped action authorization
The system SHALL authorize sensitive remote actions only when the session is active, visible, unexpired, not revoked, and includes the requested permission.

#### Scenario: Requested permission is not granted
- **WHEN** a viewer requests a sensitive action that is not in the active grant
- **THEN** the system denies the action

#### Scenario: Active grant contains permission
- **WHEN** a viewer requests a sensitive action included in an active visible unexpired grant
- **THEN** the system authorizes the action

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

### Requirement: Host pause and resume lifecycle
The system SHALL model host pause as a non-terminal authorization state that immediately denies sensitive remote action checks until the host explicitly resumes the visible unexpired authorization.

#### Scenario: Host pauses active authorization
- **WHEN** the host pauses an active visible unexpired authorization
- **THEN** the system marks the authorization `paused` and remote action checks fail closed

#### Scenario: Paused authorization retains grant scope
- **WHEN** an authorization is paused
- **THEN** the authorization retains its granted permission list without authorizing those permissions while paused

#### Scenario: Host resumes paused authorization
- **WHEN** the host resumes a paused visible unexpired authorization
- **THEN** the system marks the authorization `active` and action checks for granted permissions can succeed again

#### Scenario: Resume rejects non-paused authorization
- **WHEN** a resume is attempted for a pending, denied, active, revoked, terminated, or expired authorization
- **THEN** the system rejects the transition and does not grant remote action access

#### Scenario: Resume rejects invisible or expired authorization
- **WHEN** a resume is attempted for an invisible or expired authorization
- **THEN** the system rejects the transition and remote action checks fail closed

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

### Requirement: Approval grant scope constraint
The system SHALL allow host approval to grant only a non-empty subset of the permissions requested by the pending authorization.

#### Scenario: Host approves exact requested scope
- **WHEN** a pending authorization requests screen viewing and the host approves screen viewing
- **THEN** the authorization is marked approved with that requested permission

#### Scenario: Host approves narrower scope
- **WHEN** a pending authorization requests multiple permissions and the host approves only one requested permission
- **THEN** the authorization is marked approved with only the narrower granted scope

#### Scenario: Host attempts unrequested grant
- **WHEN** approval includes a permission that was not requested by the pending authorization
- **THEN** the system rejects the approval and does not create a broader grant

#### Scenario: Host attempts empty grant
- **WHEN** approval includes no granted permissions
- **THEN** the system rejects the approval instead of creating an approved authorization with no remote action scope

#### Scenario: Host attempts duplicate grants
- **WHEN** approval includes duplicate granted permissions
- **THEN** the system rejects the approval so grant scope and audit metadata remain unambiguous

#### Scenario: Viewer requests no permissions
- **WHEN** a viewer authorization request contains no requested permissions
- **THEN** the system rejects the pending authorization request before host approval

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

### Requirement: Non-blank authorization reasons
The system SHALL reject authorization lifecycle records and transitions that include blank or whitespace-only reason text.

#### Scenario: Denial reason is blank
- **WHEN** a host denial transition is attempted with a whitespace-only reason
- **THEN** the authorization state machine rejects the transition before recording denied state

#### Scenario: Termination reason is blank
- **WHEN** a session termination transition is attempted with a whitespace-only reason
- **THEN** the authorization state machine rejects the transition before recording terminated state

#### Scenario: Optional lifecycle reason is blank
- **WHEN** a revocation, pause, or resume transition includes a whitespace-only optional reason
- **THEN** the authorization state machine rejects the transition instead of storing meaningless audit metadata

#### Scenario: Parsed authorization record has blank reason
- **WHEN** an authorization record includes a whitespace-only reason
- **THEN** the authorization schema rejects the record before action authorization can use it

#### Scenario: Optional lifecycle reason is omitted
- **WHEN** a transition omits an optional reason and the state machine has a safe default reason
- **THEN** the transition remains valid and records the default reason
