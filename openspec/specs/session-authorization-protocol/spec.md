# session-authorization-protocol Specification

## Purpose
Defines protocol messages for requesting, deciding, updating, pausing, resuming, revoking, and terminating session authorization.
## Requirements
### Requirement: Authorization request message
The protocol SHALL provide a session authorization request message that carries viewer identity, requested permissions, and request reason without granting access.

#### Scenario: Viewer requests scoped authorization
- **WHEN** a viewer sends a session authorization request
- **THEN** the message includes viewer peer id, requested permissions, and optional reason

### Requirement: Authorization decision message
The protocol SHALL provide a host decision message that explicitly approves or denies requested permissions and includes expiration for approvals.

#### Scenario: Host approves request
- **WHEN** the host approves a session authorization request
- **THEN** the decision message includes approved status, granted permissions, expiration, and host peer id

#### Scenario: Host denies request
- **WHEN** the host denies a session authorization request
- **THEN** the decision message includes denied status, empty granted permissions, host peer id, and reason

### Requirement: Authorization state update message
The protocol SHALL provide a state update message that carries the current authorization status, visible host state, granted permissions, and expiration. Pre-active `pending` or `approved` state updates MUST NOT report `visibleToHost: true`.

#### Scenario: Session becomes active
- **WHEN** a session authorization becomes active
- **THEN** the update message includes active status and `visibleToHost` set to true

#### Scenario: Approved state is not visible
- **WHEN** a state update reports status `approved`
- **THEN** `visibleToHost` MUST be false because the visible session is not active yet

#### Scenario: Pending state is not visible
- **WHEN** a state update reports status `pending`
- **THEN** `visibleToHost` MUST be false because the host has not activated a visible session

### Requirement: Permission revoke message
The protocol SHALL provide a permission revoke message that names the revoked permission, actor, and reason.

#### Scenario: Host revokes keyboard input
- **WHEN** the host revokes keyboard input permission
- **THEN** the revoke message identifies `input:keyboard`, actor peer id, and reason

### Requirement: Pause and resume state updates
The protocol SHALL represent host pause and resume as explicit session control messages paired with authorization state updates.

#### Scenario: Host pauses authorization
- **WHEN** the host pauses a visible active authorization
- **THEN** it sends `session-control` with action `pause` and sends `session-authorization-state` with status `paused`, `visibleToHost` set to true, and the current permission list

#### Scenario: Host resumes authorization
- **WHEN** the host resumes a paused visible unexpired authorization
- **THEN** it sends `session-control` with action `resume` and sends `session-authorization-state` with status `active`, `visibleToHost` set to true, and the current permission list

#### Scenario: Pause and resume are not remote action grants
- **WHEN** pause or resume protocol messages are sent
- **THEN** they do not authorize screen capture, input, clipboard, file transfer, diagnostics, or any other sensitive action unless the resulting authorization state is active, visible, unexpired, and scoped to the requested permission

### Requirement: Authorization protocol permission-scope invariants
The protocol SHALL reject malformed authorization request, decision, and state update messages that carry empty, duplicate, or fail-open permission scopes, approval-only metadata on fail-closed decisions, or host-visible state before activation.

#### Scenario: Authorization request includes duplicate permissions
- **WHEN** a viewer sends a `session-authorization-request` with duplicate requested permissions
- **THEN** the protocol schema rejects the message before it can be forwarded or processed

#### Scenario: Approved decision has no granted permissions
- **WHEN** a host sends an approved `session-authorization-decision` with no granted permissions
- **THEN** the protocol schema rejects the message because approved decisions must carry a non-empty grant scope

#### Scenario: Approved decision includes duplicate grants
- **WHEN** a host sends an approved `session-authorization-decision` with duplicate granted permissions
- **THEN** the protocol schema rejects the message so grant scope remains unambiguous

#### Scenario: Denied decision carries granted permissions
- **WHEN** a host sends a denied `session-authorization-decision` with any granted permissions
- **THEN** the protocol schema rejects the message and preserves deny-by-default behavior

#### Scenario: Denied decision carries expiration
- **WHEN** a host sends a denied `session-authorization-decision` with `expiresAt`
- **THEN** the protocol schema rejects the message because expiration metadata only applies to approval grants

#### Scenario: Active or paused state lacks permissions
- **WHEN** a `session-authorization-state` update has status `approved`, `active`, or `paused` and no permissions
- **THEN** the protocol schema rejects the message before peers can treat it as a usable grant

#### Scenario: State update includes duplicate permissions
- **WHEN** a `session-authorization-state` update includes duplicate permissions
- **THEN** the protocol schema rejects the message so grant scope remains unambiguous

#### Scenario: Fail-closed state carries permissions
- **WHEN** a `session-authorization-state` update has status `pending`, `denied`, `revoked`, `terminated`, or `expired` and includes permissions
- **THEN** the protocol schema rejects the message because fail-closed states must not carry usable grant scope

#### Scenario: Pre-active state reports visible host session
- **WHEN** a `session-authorization-state` update has status `pending` or `approved` and reports `visibleToHost` as true
- **THEN** the protocol schema rejects the message so pre-active consent cannot be confused with an active visible session

### Requirement: Legacy host consent message permission-scope invariants
The protocol SHALL reject malformed legacy `host-consent-required` and `host-consent-decision` messages that carry empty, duplicate, or fail-open permission scopes.

#### Scenario: Legacy consent request lacks permissions
- **WHEN** a `host-consent-required` message has no requested permissions
- **THEN** the protocol schema rejects the message before it can be forwarded or processed

#### Scenario: Legacy consent request includes duplicate permissions
- **WHEN** a `host-consent-required` message includes duplicate requested permissions
- **THEN** the protocol schema rejects the message so requested scope remains unambiguous

#### Scenario: Legacy consent approval lacks grants
- **WHEN** a `host-consent-decision` message is approved but has no granted permissions
- **THEN** the protocol schema rejects the message because approval must carry a non-empty grant scope

#### Scenario: Legacy consent approval includes duplicate grants
- **WHEN** a `host-consent-decision` message is approved with duplicate granted permissions
- **THEN** the protocol schema rejects the message so granted scope remains unambiguous

#### Scenario: Legacy consent denial carries grants
- **WHEN** a `host-consent-decision` message is denied but includes granted permissions
- **THEN** the protocol schema rejects the message and preserves deny-by-default behavior

#### Scenario: Legacy consent denial lacks reason
- **WHEN** a `host-consent-decision` message is denied without a reason
- **THEN** the protocol schema rejects the message so denial remains explicit and auditable

#### Scenario: Legacy consent denial has blank reason
- **WHEN** a `host-consent-decision` message is denied with a whitespace-only reason
- **THEN** the protocol schema rejects the message so denial remains explicit and auditable

### Requirement: Session control action payload invariants
The protocol SHALL reject malformed `session-control` messages whose action-specific payload is ambiguous or fail-open.

#### Scenario: Revoke-permission control includes permission
- **WHEN** a `session-control` message has action `revoke-permission` and includes a permission
- **THEN** the protocol schema accepts the message as permission-revocation intent

#### Scenario: Revoke-permission control lacks permission
- **WHEN** a `session-control` message has action `revoke-permission` and omits permission
- **THEN** the protocol schema rejects the message before peers can process ambiguous revocation intent

#### Scenario: Pause control includes permission
- **WHEN** a `session-control` message has action `pause` and includes permission
- **THEN** the protocol schema rejects the message so pause cannot be confused with permission revocation or grant scope

#### Scenario: Resume control includes permission
- **WHEN** a `session-control` message has action `resume` and includes permission
- **THEN** the protocol schema rejects the message so resume cannot be confused with a permission grant

#### Scenario: Terminate control includes permission
- **WHEN** a `session-control` message has action `terminate` and includes permission
- **THEN** the protocol schema rejects the message because termination applies to the session rather than a single permission

#### Scenario: Control reason is blank
- **WHEN** a `session-control` message includes a whitespace-only reason
- **THEN** the protocol schema rejects the message so optional reasons remain explicit and auditable

### Requirement: Non-blank authorization protocol reasons
The protocol SHALL reject authorization-related messages that include blank or whitespace-only reason text.

#### Scenario: Authorization request reason is blank
- **WHEN** a `session-authorization-request` includes a whitespace-only reason
- **THEN** the protocol schema rejects the message before it can be forwarded or processed

#### Scenario: Authorization denial reason is blank
- **WHEN** a denied `session-authorization-decision` includes a whitespace-only reason
- **THEN** the protocol schema rejects the message so denial remains explicit and auditable

#### Scenario: Authorization state reason is blank
- **WHEN** a `session-authorization-state` includes a whitespace-only reason
- **THEN** the protocol schema rejects the message before peers can record meaningless lifecycle metadata

#### Scenario: Permission revoked reason is blank
- **WHEN** a `permission-revoked` message includes a whitespace-only reason
- **THEN** the protocol schema rejects the message so revocation remains explicit and auditable

#### Scenario: Optional authorization reason is omitted
- **WHEN** an authorization-related protocol message omits an optional reason
- **THEN** the protocol schema accepts the message when all other required fields are valid
