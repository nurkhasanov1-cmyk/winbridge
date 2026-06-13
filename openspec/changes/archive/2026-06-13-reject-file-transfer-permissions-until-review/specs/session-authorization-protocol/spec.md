## ADDED Requirements

### Requirement: Authorization protocol rejects file-transfer permission

The protocol SHALL reject `file-transfer` in legacy host consent request,
legacy host consent decision, authorization request, authorization decision,
authorization state, permission-revoked, and session-control permission fields
until a dedicated file-transfer capability is specified, reviewed, and
implemented through OpenSpec.

#### Scenario: Legacy host consent request asks for file transfer

- **WHEN** a `host-consent-required` message includes `file-transfer` in `requestedPermissions`
- **THEN** protocol schema validation rejects the message before it can be forwarded or processed
- **AND** the rejection MUST NOT approve authorization, activate host visibility, grant permissions, expose file contents, transfer files, start capture, send input, reconnect a peer, or bypass consent workflows

#### Scenario: Legacy host consent decision grants file transfer

- **WHEN** a `host-consent-decision` message includes `file-transfer` in `grantedPermissions`
- **THEN** protocol schema validation rejects the decision before peers can treat it as an approval grant

#### Scenario: Authorization request asks for file transfer

- **WHEN** a `session-authorization-request` includes `file-transfer` in `requestedPermissions`
- **THEN** protocol schema validation rejects the message before it can be forwarded or processed
- **AND** the rejection MUST NOT approve authorization, activate host visibility, grant permissions, expose file contents, transfer files, start capture, send input, reconnect a peer, or bypass consent workflows

#### Scenario: Authorization decision grants file transfer

- **WHEN** a `session-authorization-decision` includes `file-transfer` in `grantedPermissions`
- **THEN** protocol schema validation rejects the decision before peers can treat it as an approval grant

#### Scenario: Authorization state carries file transfer

- **WHEN** a `session-authorization-state` includes `file-transfer` in `permissions`
- **THEN** protocol schema validation rejects the state update before peers can treat it as authorization state

#### Scenario: Permission revoked names file transfer

- **WHEN** a `permission-revoked` message names `file-transfer`
- **THEN** protocol schema validation rejects the revocation before peers can process ambiguous file-transfer lifecycle metadata

#### Scenario: Session control names file-transfer permission

- **WHEN** a `session-control` message uses action `revoke-permission` and names `file-transfer`
- **THEN** protocol schema validation rejects the control before peers can process ambiguous file-transfer lifecycle intent
