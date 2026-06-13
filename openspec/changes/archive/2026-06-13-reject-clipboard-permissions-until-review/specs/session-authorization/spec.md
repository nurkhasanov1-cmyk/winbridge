## ADDED Requirements

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
