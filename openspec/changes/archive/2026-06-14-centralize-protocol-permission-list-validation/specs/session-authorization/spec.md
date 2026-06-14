## ADDED Requirements

### Requirement: Shared authorization permission list validation
The shared session authorization state machine and consent-bound grant validation SHALL use one shared permission list validation path for permission arrays. The shared path MUST preserve the current permission vocabulary, maximum permission count, uniqueness requirement, and fail-closed rejection of unavailable, covert, administrative, persistence, credential, keylogging, stealth, and Windows prompt bypass permission shapes.

#### Scenario: Shared permission list rejects ambiguous authorization scope
- **WHEN** an authorization request, approval grant, parsed authorization record, consent-bound grant, permission revocation input, or direct action authorization check includes duplicate, oversized, unavailable, covert, administrative, persistence, credential, keylogging, stealth, or Windows prompt bypass permission-shaped values
- **THEN** validation rejects the input before creating, restoring, revoking, or authorizing remote-action scope
- **AND** the rejection MUST NOT approve a session, activate host visibility, grant permissions, start capture, send input, reconnect peers, suppress host visibility, expose clipboard, transfer files, expose diagnostics, install services, configure startup persistence, collect credentials, hide the session from the host, or bypass consent workflows

#### Scenario: Shared permission list preserves safe authorization scope
- **WHEN** authorization or consent-bound grant inputs use one or more unique currently available permissions and satisfy all lifecycle, host-visibility, expiration, and consent requirements
- **THEN** validation preserves the existing accepted authorization and grant behavior
