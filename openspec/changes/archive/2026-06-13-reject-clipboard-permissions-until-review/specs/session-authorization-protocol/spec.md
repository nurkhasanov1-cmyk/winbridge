## ADDED Requirements

### Requirement: Authorization protocol rejects clipboard permissions

The protocol SHALL reject clipboard permissions, including `clipboard:read` and
`clipboard:write`, in authorization request, authorization decision,
authorization state, permission-revoked, and session-control permission fields
until a dedicated clipboard capability is specified, reviewed, and implemented
through OpenSpec.

#### Scenario: Authorization request asks for clipboard access

- **WHEN** a `session-authorization-request` includes `clipboard:read` or `clipboard:write` in `requestedPermissions`
- **THEN** protocol schema validation rejects the message before it can be forwarded or processed
- **AND** the rejection MUST NOT approve authorization, activate host visibility, grant permissions, expose clipboard contents, start capture, send input, reconnect a peer, or bypass consent workflows

#### Scenario: Authorization decision grants clipboard access

- **WHEN** a `session-authorization-decision` includes `clipboard:read` or `clipboard:write` in `grantedPermissions`
- **THEN** protocol schema validation rejects the decision before peers can treat it as an approval grant

#### Scenario: Authorization state carries clipboard access

- **WHEN** a `session-authorization-state` includes `clipboard:read` or `clipboard:write` in `permissions`
- **THEN** protocol schema validation rejects the state update before peers can treat it as authorization state

#### Scenario: Permission revoked names clipboard access

- **WHEN** a `permission-revoked` message names `clipboard:read` or `clipboard:write`
- **THEN** protocol schema validation rejects the revocation before peers can process ambiguous clipboard lifecycle metadata

#### Scenario: Session control names clipboard permission

- **WHEN** a `session-control` message uses action `revoke-permission` and names `clipboard:read` or `clipboard:write`
- **THEN** protocol schema validation rejects the control before peers can process ambiguous clipboard lifecycle intent
