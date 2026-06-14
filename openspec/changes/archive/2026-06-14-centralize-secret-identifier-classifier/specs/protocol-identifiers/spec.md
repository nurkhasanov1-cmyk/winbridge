## ADDED Requirements

### Requirement: Shared secret-bearing identifier classifier
The system SHALL use one shared classifier for protocol-facing identifier metadata checks that reject or redact secret-bearing protocol identifiers across audit records, protocol audit-event envelopes, authorization identifiers, audit detail authorization identifiers, and consent-bound session grant identifiers. The shared classifier MUST preserve the current secret-bearing marker families and MUST NOT expose raw rejected identifier values in validation diagnostics.

#### Scenario: Shared marker family rejects audit and grant identifiers
- **WHEN** an audit fixed identifier or consent-bound session grant fixed identifier contains a secret-bearing marker family such as token, credential, password, passphrase, secret, pairing-code, API-key, access-key, cookie, private-key, SSH-key, authorization, authorization-header, auth-header, or proxy-authorization
- **THEN** validation rejects the object before storage, forwarding, encoding, returning a grant snapshot, or authorizing a sensitive action
- **AND** the rejection does not expose the raw identifier value

#### Scenario: Safe identifiers keep existing behavior
- **WHEN** protocol-facing audit, audit-event, authorization, audit detail authorization id, or consent-bound grant identifiers use schema-valid non-secret values
- **THEN** validation preserves the existing acceptance, redaction, and authorization behavior for those values

#### Scenario: Shared classifier remains non-authorizing
- **WHEN** the shared identifier classifier rejects secret-bearing metadata
- **THEN** the rejection MUST NOT approve a session, activate host visibility, grant permissions, start capture, send input, reconnect peers, suppress host visibility, sync clipboard, transfer files, expose diagnostics, install services, configure startup persistence, collect credentials, hide the session from the host, or bypass consent workflows
