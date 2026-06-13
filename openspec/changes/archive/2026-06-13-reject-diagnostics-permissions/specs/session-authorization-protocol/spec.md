## ADDED Requirements

### Requirement: Authorization protocol rejects diagnostics permissions
The protocol SHALL reject diagnostics-shaped permissions, including `diagnostics:view`, in authorization request, authorization decision, authorization state, permission-revoked, and session-control permission fields until a dedicated diagnostics capability is specified, reviewed, and implemented through OpenSpec.

#### Scenario: Authorization request asks for diagnostics
- **WHEN** a `session-authorization-request` includes `diagnostics:view` in `requestedPermissions`
- **THEN** protocol schema validation rejects the message before it can be forwarded or processed
- **AND** the rejection MUST NOT approve authorization, activate host visibility, grant permissions, expose diagnostics, start capture, send input, reconnect a peer, or bypass consent workflows

#### Scenario: Authorization decision grants diagnostics
- **WHEN** a `session-authorization-decision` includes `diagnostics:view` in `grantedPermissions`
- **THEN** protocol schema validation rejects the decision before peers can treat it as an approval grant

#### Scenario: Authorization state carries diagnostics
- **WHEN** a `session-authorization-state` includes `diagnostics:view` in `permissions`
- **THEN** protocol schema validation rejects the state update before peers can treat it as authorization state

#### Scenario: Permission revoked names diagnostics
- **WHEN** a `permission-revoked` message names `diagnostics:view`
- **THEN** protocol schema validation rejects the revocation before peers can process ambiguous diagnostics lifecycle metadata

#### Scenario: Session control names diagnostics permission
- **WHEN** a `session-control` message uses action `revoke-permission` and names `diagnostics:view`
- **THEN** protocol schema validation rejects the control before peers can process ambiguous diagnostics lifecycle intent
