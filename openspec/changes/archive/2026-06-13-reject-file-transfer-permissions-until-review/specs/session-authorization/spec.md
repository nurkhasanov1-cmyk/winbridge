## ADDED Requirements

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
