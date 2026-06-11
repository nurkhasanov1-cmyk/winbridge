## ADDED Requirements

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
