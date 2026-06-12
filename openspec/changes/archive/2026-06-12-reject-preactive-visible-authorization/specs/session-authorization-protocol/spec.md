# session-authorization-protocol Delta

## MODIFIED Requirements

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
