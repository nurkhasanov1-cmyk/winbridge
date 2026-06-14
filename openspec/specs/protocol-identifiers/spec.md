# protocol-identifiers Specification

## Purpose
Defines shared constraints for protocol-facing machine identifiers before relay, authorization, pairing, and audit-related protocol use.
## Requirements
### Requirement: Bounded protocol machine identifiers
The system SHALL validate protocol-facing machine identifiers with shared length and printable-character constraints before using them for relay registration, forwarding, authorization, pairing, or audit-related protocol metadata.

#### Scenario: Existing development identifiers are accepted
- **WHEN** protocol messages or records include existing development identifiers such as `session-demo`, `host-1`, `viewer-1`, UUID message ids, `authz_*`, `audit_*`, or `pair_*`
- **THEN** schema validation accepts those identifiers when the rest of the object is valid

#### Scenario: Oversized identifier is rejected
- **WHEN** a protocol message, authorization record, pairing record, device identity, or session grant includes an identifier longer than the shared bound
- **THEN** schema validation rejects the object before relay registration, forwarding, authorization, pairing, or audit-related protocol use

#### Scenario: Unsafe identifier characters are rejected
- **WHEN** an identifier contains whitespace, control characters, path separators, JSON delimiters, or other characters outside the machine-identifier profile
- **THEN** schema validation rejects the object before it can affect relay state, authorization state, pairing state, or audit-related protocol metadata

### Requirement: Fixed-shape protocol objects reject unknown fields
The system SHALL reject unknown fields on fixed-shape protocol-facing objects before using them for relay registration, forwarding, authorization, pairing, session grants, or audit-related protocol metadata.

#### Scenario: Protocol envelope has unknown fixed field
- **WHEN** a protocol envelope includes an unknown top-level field outside its message schema
- **THEN** schema validation MUST reject the envelope before relay registration, forwarding, authorization, pairing, or audit-related protocol use

#### Scenario: Nested fixed protocol object has unknown field
- **WHEN** a protocol-facing fixed nested object such as device identity, audit actor metadata, or audit target metadata includes an unknown field
- **THEN** schema validation MUST reject the object before the nested metadata can be trusted

#### Scenario: Extensible metadata containers remain supported
- **WHEN** a `signal.payload`, protocol `audit-event.detail`, or audit record `detail` object contains JSON-compatible non-sensitive metadata
- **THEN** schema validation MAY preserve that metadata according to the existing payload/detail validation and redaction rules

### Requirement: Secret-safe relay handling for malformed identifiers
The relay SHALL treat malformed identifiers as invalid protocol input and keep peer-facing relay errors and invalid-message audit reasons bounded and secret-safe.

#### Scenario: Malformed join identifier is rejected before registration
- **WHEN** an unregistered peer sends a join message with an oversized or unsafe session id, peer id, message id, or device id
- **THEN** the relay rejects the message before registering the peer or forwarding any peer message

#### Scenario: Malformed identifier is not reflected
- **WHEN** the relay rejects malformed protocol input because of an identifier value
- **THEN** the peer-facing relay error and invalid-message audit reason MUST NOT include the raw identifier, parser internals, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, or full secrets

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
