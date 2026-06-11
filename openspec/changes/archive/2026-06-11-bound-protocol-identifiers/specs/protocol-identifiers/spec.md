## ADDED Requirements

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

### Requirement: Secret-safe relay handling for malformed identifiers
The relay SHALL treat malformed identifiers as invalid protocol input and keep peer-facing relay errors and invalid-message audit reasons bounded and secret-safe.

#### Scenario: Malformed join identifier is rejected before registration
- **WHEN** an unregistered peer sends a join message with an oversized or unsafe session id, peer id, message id, or device id
- **THEN** the relay rejects the message before registering the peer or forwarding any peer message

#### Scenario: Malformed identifier is not reflected
- **WHEN** the relay rejects malformed protocol input because of an identifier value
- **THEN** the peer-facing relay error and invalid-message audit reason MUST NOT include the raw identifier, parser internals, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, or full secrets
