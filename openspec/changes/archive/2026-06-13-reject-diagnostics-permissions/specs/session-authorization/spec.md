## ADDED Requirements

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
