## ADDED Requirements

### Requirement: Shared protocol permission list validation
Authorization-related protocol envelopes SHALL use one shared permission list validation path for requested, granted, active, and revoked permission metadata. The shared path MUST preserve the current permission vocabulary, maximum permission count, uniqueness requirement for list fields, and fail-closed rejection of unavailable, covert, administrative, persistence, credential, keylogging, stealth, and Windows prompt bypass permission shapes before forwarding, trusted runtime event emission, persistence, or workflow processing.

#### Scenario: Shared protocol permission list rejects ambiguous scope
- **WHEN** a host consent, session authorization request, session authorization decision, session authorization state, permission-revoked, or session-control envelope includes duplicate, oversized, unavailable, covert, administrative, persistence, credential, keylogging, stealth, or Windows prompt bypass permission-shaped values
- **THEN** protocol validation rejects the envelope before peers can treat it as requested, granted, active, revoked, or action-authorized scope
- **AND** the rejection MUST NOT approve authorization, activate host visibility, grant permissions, start capture, send input, reconnect peers, suppress host visibility, expose clipboard, transfer files, expose diagnostics, install services, configure startup persistence, collect credentials, hide the session from the host, or bypass consent workflows

#### Scenario: Shared protocol permission list preserves safe scope
- **WHEN** authorization-related protocol envelopes use unique currently available permission metadata and satisfy all existing action-specific invariants
- **THEN** validation preserves the existing accepted protocol shape and behavior
