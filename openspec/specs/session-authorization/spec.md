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
The system SHALL authorize sensitive remote actions only when the session is active, visible, unexpired, not revoked, and includes the requested permission. Pending, approved, and denied authorizations MUST NOT report host visible active-session state.

#### Scenario: Requested permission is not granted
- **WHEN** a viewer requests a sensitive action that is not in the active grant
- **THEN** the system denies the action

#### Scenario: Active grant contains permission
- **WHEN** a viewer requests a sensitive action included in an active visible unexpired grant
- **THEN** the system authorizes the action

#### Scenario: Pending authorization reports visible state
- **WHEN** a pending authorization record reports `visibleToHost` as true
- **THEN** the schema rejects the record before any remote action check can use it

#### Scenario: Approved authorization reports visible state
- **WHEN** an approved authorization record reports `visibleToHost` as true
- **THEN** the schema rejects the record because host visibility only applies after activation

#### Scenario: Denied authorization reports visible state
- **WHEN** a denied authorization record reports `visibleToHost` as true
- **THEN** the schema rejects the record because denied requests never become active visible sessions

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
The system SHALL reject malformed session authorization records during schema parsing before any remote action authorization check can use them, including pre-active or denied records that carry lifecycle timestamps from impossible later states and records whose authorization timestamps are out of order.

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

#### Scenario: Denied authorization is visible
- **WHEN** a denied authorization record reports host visible state
- **THEN** the schema rejects the record so denied consent cannot be confused with an active visible session

#### Scenario: Lifecycle state lacks required timestamp
- **WHEN** a denied, approved, active, paused, revoked, terminated, or expired authorization record lacks its corresponding lifecycle timestamp
- **THEN** the schema rejects the record so authorization history remains auditable

#### Scenario: Pending authorization carries later lifecycle timestamp
- **WHEN** a pending authorization record carries denied, approved, activated, paused, resumed, revoked, terminated, or expired timestamp metadata
- **THEN** the schema rejects the record so pending consent cannot be confused with a later lifecycle state

#### Scenario: Approved authorization carries later lifecycle timestamp
- **WHEN** an approved authorization record carries denied, activated, paused, resumed, revoked, terminated, or expired timestamp metadata
- **THEN** the schema rejects the record so approval cannot be confused with active or terminal lifecycle history

#### Scenario: Denied authorization carries conflicting lifecycle timestamp
- **WHEN** a denied authorization record carries approved, activated, paused, resumed, revoked, terminated, or expired timestamp metadata
- **THEN** the schema rejects the record so denied consent cannot be confused with an approved, active, or terminal session history

#### Scenario: Authorization record updated before creation
- **WHEN** an authorization record has `updatedAt` earlier than `createdAt`
- **THEN** the schema rejects the record so audit chronology cannot run backward

#### Scenario: Authorization expires before or at creation
- **WHEN** an authorization record has `expiresAt` earlier than or equal to `createdAt`
- **THEN** the schema rejects the record so zero or negative authorization windows cannot be represented

#### Scenario: Lifecycle timestamp is outside record window
- **WHEN** an authorization record carries a lifecycle timestamp earlier than `createdAt` or later than `updatedAt`
- **THEN** the schema rejects the record before any remote action authorization check can use it

#### Scenario: Active authorization resumed from pause lacks resume timestamp
- **WHEN** an active authorization record includes a prior pause timestamp but lacks a resume timestamp
- **THEN** the schema rejects the record so host resume remains explicit and auditable

#### Scenario: Authorization has resume timestamp without prior pause
- **WHEN** an authorization record includes a resume timestamp without a prior pause timestamp
- **THEN** the schema rejects the record as an invalid lifecycle history

### Requirement: Ordered authorization lifecycle timestamps
The system SHALL reject session authorization records whose lifecycle timestamps contradict the consent-first transition order, before any remote action authorization check can use those records.

#### Scenario: Activation cannot precede approval
- **WHEN** a parsed authorization record carries an `activatedAt`, `pausedAt`, `resumedAt`, `revokedAt`, `terminatedAt`, or `expiredAt` timestamp earlier than its `approvedAt` timestamp
- **THEN** the schema rejects the record before it can represent remote assistance access

#### Scenario: Resume cannot precede the represented pause
- **WHEN** a parsed active authorization record carries both `pausedAt` and `resumedAt`
- **THEN** the `resumedAt` timestamp MUST NOT be earlier than the `pausedAt` timestamp

#### Scenario: Live authorization cannot carry fail-closed lifecycle timestamps
- **WHEN** a parsed `active` or `paused` authorization record carries `deniedAt`, `terminatedAt`, or `expiredAt`
- **THEN** the schema rejects the record before any remote action check can treat it as active authorization
- **AND** a live `revokedAt` timestamp remains valid only as prior partial permission-revocation history for remaining permissions

#### Scenario: Terminal lifecycle cannot precede live authorization history
- **WHEN** a parsed authorization record carries a final `revokedAt`, `terminatedAt`, or `expiredAt` timestamp together with prerequisite approval, activation, pause, resume, or partial-revocation timestamps
- **THEN** the terminal lifecycle timestamp MUST NOT be earlier than the prerequisite lifecycle timestamps it records

#### Scenario: Terminal records cannot carry conflicting terminal timestamps
- **WHEN** a parsed `revoked`, `terminated`, or `expired` authorization record carries another mutually exclusive fail-closed lifecycle timestamp
- **THEN** the schema rejects the record so terminal history cannot imply multiple incompatible final outcomes

#### Scenario: Ordered partial revocation history remains valid
- **WHEN** a visible active or paused authorization carries `revokedAt` for a prior partial permission revocation after approval and activation while retaining remaining permissions
- **THEN** the schema accepts the record only if the lifecycle timestamps remain ordered and action checks still fail closed for revoked or missing permissions
- **AND** later pause or resume timestamps for the remaining permission scope MUST NOT make the prior partial `revokedAt` invalid by itself

### Requirement: Canonical authorization reasons
The system SHALL reject authorization lifecycle records and transitions that include blank, whitespace-only, oversized, untrimmed, ASCII control-character, or Unicode bidirectional or zero-width formatting-control reason text, including `U+FEFF`. Rejection MUST occur before storing the updated authorization record or using it for action authorization, and MUST NOT create or restore access.

#### Scenario: Denial reason is blank
- **WHEN** a host denial transition is attempted with a whitespace-only reason
- **THEN** the authorization state machine rejects the transition before recording denied state

#### Scenario: Denial reason is untrimmed
- **WHEN** a host denial transition is attempted with a reason containing leading or trailing whitespace
- **THEN** the authorization state machine rejects the transition before recording denied state

#### Scenario: Denial reason contains ASCII control characters
- **WHEN** a host denial transition is attempted with a reason containing an ASCII control character
- **THEN** the authorization state machine rejects the transition before recording denied state

#### Scenario: Denial reason contains Unicode formatting controls
- **WHEN** a host denial transition is attempted with a reason containing a Unicode bidirectional or zero-width formatting control including `U+FEFF`
- **THEN** the authorization state machine rejects the transition before recording denied state

#### Scenario: Termination reason is blank
- **WHEN** a session termination transition is attempted with a whitespace-only reason
- **THEN** the authorization state machine rejects the transition before recording terminated state

#### Scenario: Termination reason is untrimmed
- **WHEN** a session termination transition is attempted with a reason containing leading or trailing whitespace
- **THEN** the authorization state machine rejects the transition before recording terminated state

#### Scenario: Termination reason contains ASCII control characters
- **WHEN** a session termination transition is attempted with a reason containing an ASCII control character
- **THEN** the authorization state machine rejects the transition before recording terminated state

#### Scenario: Termination reason contains Unicode formatting controls
- **WHEN** a session termination transition is attempted with a reason containing a Unicode bidirectional or zero-width formatting control including `U+FEFF`
- **THEN** the authorization state machine rejects the transition before recording terminated state

#### Scenario: Optional lifecycle reason is blank
- **WHEN** a revocation, pause, or resume transition includes a whitespace-only optional reason
- **THEN** the authorization state machine rejects the transition instead of storing meaningless audit metadata

#### Scenario: Optional lifecycle reason is untrimmed
- **WHEN** a revocation, pause, or resume transition includes a reason containing leading or trailing whitespace
- **THEN** the authorization state machine rejects the transition instead of storing ambiguous audit metadata

#### Scenario: Optional lifecycle reason contains ASCII control characters
- **WHEN** a revocation, pause, or resume transition includes a reason containing an ASCII control character
- **THEN** the authorization state machine rejects the transition instead of storing ambiguous audit metadata

#### Scenario: Optional lifecycle reason contains Unicode formatting controls
- **WHEN** a revocation, pause, or resume transition includes a reason containing a Unicode bidirectional or zero-width formatting control including `U+FEFF`
- **THEN** the authorization state machine rejects the transition instead of storing ambiguous audit metadata

#### Scenario: Parsed authorization record has blank reason
- **WHEN** an authorization record includes a whitespace-only reason
- **THEN** the authorization schema rejects the record before action authorization can use it

#### Scenario: Parsed authorization record has untrimmed reason
- **WHEN** an authorization record includes a reason containing leading or trailing whitespace
- **THEN** the authorization schema rejects the record before action authorization can use it

#### Scenario: Parsed authorization record reason contains ASCII control characters
- **WHEN** an authorization record includes a reason containing an ASCII control character
- **THEN** the authorization schema rejects the record before action authorization can use it

#### Scenario: Parsed authorization record reason contains Unicode formatting controls
- **WHEN** an authorization record includes a reason containing a Unicode bidirectional or zero-width formatting control including `U+FEFF`
- **THEN** the authorization schema rejects the record before action authorization can use it

#### Scenario: Reason rejection is fail-closed and secret-safe
- **WHEN** authorization reason validation rejects a malformed transition or parsed record
- **THEN** the rejection MUST NOT approve a session, activate host visibility, grant permissions, start capture, send input, reconnect a peer, suppress visibility, or bypass consent workflows
- **AND** diagnostics MUST NOT expose raw private reason text

#### Scenario: Optional lifecycle reason is omitted
- **WHEN** a transition omits an optional reason and the state machine has a safe default reason
- **THEN** the transition remains valid and records the default reason

### Requirement: Consent-bound session grant invariants
The system SHALL reject consent-bound session grant records whose permission scope is empty or contains duplicate permissions before any remote action authorization check can use them.

#### Scenario: Session grant has empty permissions
- **WHEN** a consent-bound session grant record contains no permissions
- **THEN** schema validation rejects the record before it can represent remote action authorization

#### Scenario: Session grant has duplicate permissions
- **WHEN** a consent-bound session grant record contains duplicate permissions
- **THEN** schema validation rejects the record so grant scope and audit metadata remain unambiguous

#### Scenario: Session grant has unique permissions
- **WHEN** a consent-bound session grant record contains one or more unique permissions, explicit host approval, visible-session requirement, and a future expiration
- **THEN** the grant can pass schema validation and still must satisfy the requested permission check before any sensitive action is authorized

### Requirement: Authorization records and grants reject unknown fixed fields
The system SHALL reject unknown fields on session authorization records and consent-bound session grant records before any remote action authorization check can use them.

#### Scenario: Session authorization has unknown field
- **WHEN** a session authorization record includes an unknown top-level field
- **THEN** schema validation MUST reject the record before any remote action authorization check can use it

#### Scenario: Consent-bound grant has unknown field
- **WHEN** a consent-bound session grant record includes an unknown top-level field
- **THEN** schema validation MUST reject the grant before any sensitive action can be authorized

#### Scenario: Rejection does not weaken lifecycle checks
- **WHEN** an authorization record or grant has no unknown fields
- **THEN** all existing consent, host visibility, expiration, permission scope, revocation, pause, resume, and termination checks MUST continue to apply

### Requirement: Authorization identifiers are non-secret metadata
The system SHALL reject session authorization records whose `authorizationId` contains secret-bearing metadata such as token, credential, cookie, API key, access key, private key, SSH key, authorization header, or auth header markers. Rejection MUST occur before storing the authorization record, processing a lifecycle transition, or using the record for remote action authorization.

#### Scenario: Pending authorization id contains secret marker
- **WHEN** a pending authorization record is created with a secret-bearing `authorizationId`
- **THEN** the system rejects the record before creating authorization state
- **AND** the rejection MUST NOT approve a session, activate host visibility, grant permissions, start capture, send input, reconnect a peer, or bypass consent workflows

#### Scenario: Parsed authorization record contains secret marker
- **WHEN** a parsed authorization record contains a secret-bearing `authorizationId`
- **THEN** schema validation rejects the record before any remote action check can use it

#### Scenario: Safe authorization id remains valid
- **WHEN** an authorization record uses a schema-valid non-secret `authorizationId`
- **THEN** the system accepts that identifier if all other consent, visibility, expiration, and permission-scope requirements pass

### Requirement: Diagnostics permissions require explicit future capability
The system SHALL reject diagnostics-shaped permissions, including `diagnostics:view`, in authorization requests, approval grants, parsed authorization records, consent-bound session grants, permission revocation inputs, and action authorization checks until a dedicated diagnostics capability is specified, reviewed, and implemented through OpenSpec.

#### Scenario: Viewer requests diagnostics permission
- **WHEN** a pending session authorization is created with `diagnostics:view` in the requested permissions
- **THEN** the state machine rejects the request before creating authorization state
- **AND** the rejection MUST NOT approve a session, activate host visibility, grant permissions, expose diagnostics, start capture, send input, reconnect a peer, or bypass consent workflows

#### Scenario: Host grants diagnostics permission
- **WHEN** host approval includes `diagnostics:view` in the granted permissions
- **THEN** the state machine rejects the approval before creating an approved authorization

#### Scenario: Parsed authorization carries diagnostics permission
- **WHEN** a parsed authorization record contains `diagnostics:view` in its permission list
- **THEN** schema validation rejects the record before any remote action authorization check can use it

#### Scenario: Consent-bound grant carries diagnostics permission
- **WHEN** a consent-bound session grant record contains `diagnostics:view`
- **THEN** schema validation rejects the grant before any sensitive action can be authorized

#### Scenario: Diagnostics permission is checked directly
- **WHEN** an action authorization check is attempted for `diagnostics:view`
- **THEN** the permission parser rejects the action check before diagnostics access can be authorized

### Requirement: Authorization rejects covert and high-risk administrative permission shapes
The shared session authorization state machine and consent-bound grant validation SHALL reject permission strings outside the current permission vocabulary, including representative shapes `remote-shell`, `admin:run`, `unattended:access`, `persistence:install`, `service:install`, `startup:persist`, `privilege:elevate`, `credential:read`, `keylog:capture`, `stealth:session`, and `windows-prompt:bypass`. These strings MUST be rejected in pending request creation, approval grants, parsed authorization records, consent-bound grants, permission revocation, and direct action authorization checks before any access is created, restored, revoked, or authorized.

#### Scenario: Viewer request uses a rejected permission shape
- **WHEN** pending session authorization is created with a covert or high-risk administrative permission-shaped string
- **THEN** authorization creation fails before a pending request exists

#### Scenario: Host approval or grant uses a rejected permission shape
- **WHEN** host approval or consent-bound grant validation includes a covert or high-risk administrative permission-shaped string
- **THEN** the grant is rejected before it can authorize remote access

#### Scenario: Revocation or action check uses a rejected permission shape
- **WHEN** a revocation request or direct action authorization check names a covert or high-risk administrative permission-shaped string
- **THEN** the authorization layer rejects the permission before changing state or authorizing the action

### Requirement: Authorization rejects secret-bearing lifecycle reasons
The shared session authorization state machine SHALL reject lifecycle reason text that contains secret-bearing metadata before creating, parsing, or updating authorization state. Secret-bearing metadata MUST include raw token, credential, password, passphrase, pairing-code, API-key, authorization-header, auth-header, cookie, private-key, SSH-key, keystroke, screenshot, screen-data, screen-content, clipboard-content, file-transfer content/data/bytes, diagnostics content/dump, or secret markers when they appear with values. Rejection diagnostics MUST NOT expose the raw reason text.

#### Scenario: Transition reason contains secret-bearing metadata
- **WHEN** a denial, revocation, pause, resume, or termination transition includes a lifecycle reason containing secret-bearing metadata
- **THEN** the authorization state machine rejects the transition before recording or restoring authorization state
- **AND** the rejection does not expose the raw reason text

#### Scenario: Parsed authorization record reason contains secret-bearing metadata
- **WHEN** an authorization record includes reason text containing secret-bearing metadata
- **THEN** the authorization schema rejects the record before action authorization can use it
- **AND** the rejection does not expose the raw reason text

#### Scenario: Safe lifecycle reason remains accepted
- **WHEN** a lifecycle transition or parsed authorization record uses concise non-secret reason text
- **THEN** the authorization layer accepts the reason when all other authorization invariants are valid

### Requirement: Clipboard permissions require explicit future capability

The shared session authorization state machine SHALL reject clipboard
permissions, including `clipboard:read` and
`clipboard:write`, in authorization requests, approval grants, parsed
authorization records, consent-bound session grants, permission revocation
inputs, and direct action authorization checks until a dedicated clipboard
capability is specified, reviewed, and implemented through OpenSpec.

#### Scenario: Viewer requests clipboard permission

- **WHEN** a pending session authorization is created with `clipboard:read` or `clipboard:write` in the requested permissions
- **THEN** the state machine rejects the request before creating authorization state
- **AND** the rejection MUST NOT approve a session, activate host visibility, grant permissions, expose clipboard contents, start capture, send input, reconnect a peer, or bypass consent workflows

#### Scenario: Host grants clipboard permission

- **WHEN** host approval includes `clipboard:read` or `clipboard:write` in the granted permissions
- **THEN** the state machine rejects the approval before creating an approved authorization

#### Scenario: Parsed authorization carries clipboard permission

- **WHEN** a parsed authorization record contains `clipboard:read` or `clipboard:write` in its permission list
- **THEN** schema validation rejects the record before any remote action authorization check can use it

#### Scenario: Consent-bound grant carries clipboard permission

- **WHEN** a consent-bound session grant record contains `clipboard:read` or `clipboard:write`
- **THEN** schema validation rejects the grant before any sensitive action can be authorized

#### Scenario: Clipboard permission is checked directly

- **WHEN** an action authorization check is attempted for `clipboard:read` or `clipboard:write`
- **THEN** the permission parser rejects the action check before clipboard access can be authorized

### Requirement: File-transfer permission requires explicit future capability

The shared session authorization state machine SHALL reject `file-transfer` in
authorization requests, approval grants, parsed authorization records,
consent-bound session grants, permission revocation inputs, and direct action
authorization checks until a dedicated file-transfer capability is specified,
reviewed, and implemented through OpenSpec.

#### Scenario: Viewer requests file-transfer permission

- **WHEN** a pending session authorization is created with `file-transfer` in the requested permissions
- **THEN** the state machine rejects the request before creating authorization state
- **AND** the rejection MUST NOT approve a session, activate host visibility, grant permissions, expose file contents, transfer files, start capture, send input, reconnect a peer, or bypass consent workflows

#### Scenario: Host grants file-transfer permission

- **WHEN** host approval includes `file-transfer` in the granted permissions
- **THEN** the state machine rejects the approval before creating an approved authorization

#### Scenario: Parsed authorization carries file-transfer permission

- **WHEN** a parsed authorization record contains `file-transfer` in its permission list
- **THEN** schema validation rejects the record before any remote action authorization check can use it

#### Scenario: Consent-bound grant carries file-transfer permission

- **WHEN** a consent-bound session grant record contains `file-transfer`
- **THEN** schema validation rejects the grant before any sensitive action can be authorized

#### Scenario: File-transfer permission is checked directly

- **WHEN** an action authorization check is attempted for `file-transfer`
- **THEN** the permission parser rejects the action check before file transfer can be authorized
