## ADDED Requirements

### Requirement: Access-key and SSH-key audit redaction
The audit layer SHALL treat audit detail keys that indicate access keys or SSH keys as sensitive authentication material and redact their values before records are stored, emitted, encoded, or persisted.

#### Scenario: Access-key audit details are redacted
- **WHEN** a component writes audit details with fields named `accessKey`, `access_key`, or `access-key`
- **THEN** the audit layer MUST replace those values with `[REDACTED]`

#### Scenario: SSH-key audit details are redacted recursively
- **WHEN** SSH-key field names such as `sshKey` or `ssh_key` appear inside nested objects or arrays in audit details
- **THEN** the audit layer MUST redact those values recursively while preserving non-sensitive metadata

#### Scenario: Authorization identifiers remain inspectable
- **WHEN** audit details include `authorizationId` alongside access-key or SSH-key fields
- **THEN** the audit layer MUST preserve the non-secret `authorizationId` and redact only the secret-key fields

### Requirement: Access-key and SSH-key audit-event redaction
The protocol schema SHALL redact access-key and SSH-key detail fields in `audit-event` messages during parsing and encoding before the message is emitted, forwarded, or persisted.

#### Scenario: Audit-event parse redacts access-key details
- **WHEN** a protocol `audit-event` detail includes `accessKey` or `sshKey`
- **THEN** protocol parsing MUST replace those values with `[REDACTED]`

#### Scenario: Audit-event encode redacts access-key details
- **WHEN** a protocol `audit-event` is encoded with `accessKey` or `sshKey` in detail metadata
- **THEN** protocol encoding MUST replace those values with `[REDACTED]` and MUST NOT include the raw values in the encoded JSON
