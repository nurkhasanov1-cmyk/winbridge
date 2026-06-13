# audit-foundation Specification

## Purpose
Defines the shared audit record contract and relay audit events needed for consent, join, rejection, and safety-relevant decisions.
## Requirements
### Requirement: Structured audit record
The system SHALL represent security-relevant events as structured audit records with event id, timestamp, actor, action, outcome, and optional session id.

#### Scenario: Relay accepts a peer join
- **WHEN** the relay accepts a peer into a session room
- **THEN** it emits an audit record with actor peer id, session id, `relay.peer.join.accepted`, and accepted outcome

#### Scenario: Relay rejects a message
- **WHEN** the relay rejects a token, join, or malformed protocol message
- **THEN** it emits an audit record with denied or failed outcome without logging raw token or raw pairing code

#### Scenario: Pairing lifecycle event
- **WHEN** pairing is created, consumed, expired, denied, or revoked
- **THEN** the system emits an audit record with actor, session id or pairing id, action, outcome, and reason code when available

### Requirement: Bounded relay audit actor identifiers
The relay audit layer SHALL emit schema-valid audit actor identifiers for relay events associated with any valid protocol peer id. Relay peer ids that contain secret-bearing audit metadata MUST NOT appear raw in readable actor ids or actor-related detail metadata.

#### Scenario: Short safe relay peer id remains readable
- **WHEN** the relay writes an audit record for a peer id whose prefixed relay actor id fits the protocol identifier limit and whose peer id contains no secret-bearing metadata
- **THEN** the audit actor id MAY include the readable peer id in the existing `development-relay:<peerId>` form

#### Scenario: Max-length relay peer id is bounded
- **WHEN** the relay writes an audit record for a valid peer id that would exceed the audit actor id limit after prefixing
- **THEN** the audit actor id MUST use a deterministic bounded identifier that passes audit schema validation

#### Scenario: Secret-bearing relay peer id is redacted
- **WHEN** the relay writes an audit record for a peer id that contains secret-bearing metadata such as a token, credential, cookie, API key, access key, private key, SSH key, authorization header, or auth header marker
- **THEN** the audit actor id MUST NOT include the raw peer id
- **AND** actor-related audit detail MUST include only bounded redaction metadata for that peer id

#### Scenario: Bounded relay actor metadata is secret-safe
- **WHEN** the relay uses a bounded actor id for an overlong or secret-bearing peer id
- **THEN** any additional audit detail metadata MUST be bounded, deterministic where it does not derive from a secret, and MUST NOT include raw tokens, raw pairing codes, credentials, protocol payloads, keystrokes, screenshots, screen contents, or full secrets

### Requirement: Development audit sinks
The system SHALL provide reusable development audit sinks for tests and local debugging.

#### Scenario: In-memory audit sink records events
- **WHEN** a component writes audit records to the in-memory sink
- **THEN** tests can inspect the records in write order

#### Scenario: Console audit sink writes event lines
- **WHEN** a component writes audit records to the console sink
- **THEN** each record is serialized as one JSON line

### Requirement: Audit schema validation
The system SHALL validate audit records before storing or emitting them through audit sinks. Audit records MUST reject blank, whitespace-only, oversized, untrimmed, ASCII control-character, or Unicode bidirectional or zero-width formatting-control semantic metadata fields, including action, optional reason, and target type.

#### Scenario: Audit record misses required actor
- **WHEN** a component writes an audit record without required actor metadata
- **THEN** the audit sink rejects the record

#### Scenario: Audit record action is blank
- **WHEN** a component writes an audit record with an empty or whitespace-only action
- **THEN** the audit sink rejects the record before storing or emitting meaningless action metadata

#### Scenario: Audit record action is untrimmed
- **WHEN** a component writes an audit record with an action containing leading or trailing whitespace
- **THEN** the audit sink rejects the record before storing or emitting ambiguous action metadata

#### Scenario: Audit record action contains unsafe characters
- **WHEN** a component writes an audit record with an action containing an ASCII control character or Unicode bidirectional or zero-width formatting control including `U+FEFF`
- **THEN** the audit sink rejects the record before storing or emitting ambiguous action metadata

#### Scenario: Audit record reason is blank
- **WHEN** a component writes an audit record with a whitespace-only reason
- **THEN** the audit sink rejects the record instead of storing meaningless reason metadata

#### Scenario: Audit record reason is untrimmed
- **WHEN** a component writes an audit record with a top-level reason containing leading or trailing whitespace
- **THEN** the audit sink rejects the record instead of storing ambiguous reason metadata

#### Scenario: Audit record reason contains unsafe characters
- **WHEN** a component writes an audit record with a top-level reason containing an ASCII control character or Unicode bidirectional or zero-width formatting control including `U+FEFF`
- **THEN** the audit sink rejects the record instead of storing ambiguous reason metadata

#### Scenario: Audit record target type is blank
- **WHEN** a component writes an audit record with a whitespace-only target type
- **THEN** the audit sink rejects the record before storing ambiguous target metadata

#### Scenario: Audit record target type is untrimmed
- **WHEN** a component writes an audit record with a target type containing leading or trailing whitespace
- **THEN** the audit sink rejects the record before storing ambiguous target metadata

#### Scenario: Audit record target type contains unsafe characters
- **WHEN** a component writes an audit record with a target type containing an ASCII control character or Unicode bidirectional or zero-width formatting control including `U+FEFF`
- **THEN** the audit sink rejects the record before storing ambiguous target metadata

### Requirement: Audit actor device attribution
The audit layer SHALL accept `deviceId` only for device-bound participant actors and MUST reject `deviceId` on infrastructure actors before storing, emitting, forwarding, or persisting audit records.

#### Scenario: Host actor carries device identity
- **WHEN** an audit record includes a `host` actor with a schema-valid `deviceId`
- **THEN** audit validation accepts the actor metadata

#### Scenario: Viewer actor carries device identity
- **WHEN** an audit record includes a `viewer` actor with a schema-valid `deviceId`
- **THEN** audit validation accepts the actor metadata

#### Scenario: Relay actor cannot carry device identity
- **WHEN** an audit record includes a `relay` actor with `deviceId`
- **THEN** audit validation rejects the record before storage, local emission, console output, file persistence, or protocol encoding

#### Scenario: System actor cannot carry device identity
- **WHEN** an audit record includes a `system` actor with `deviceId`
- **THEN** audit validation rejects the record before storage, local emission, console output, file persistence, or protocol encoding

### Requirement: Audit fixed fields reject unknown metadata
The audit layer SHALL reject unknown fields on fixed-shape audit records, audit actors, audit targets, and protocol `audit-event` envelopes while preserving validated audit detail metadata.

#### Scenario: Audit record has unknown top-level field
- **WHEN** a component creates or writes an audit record with an unknown top-level field
- **THEN** the audit schema MUST reject the record before storage, local emission, console output, file persistence, or protocol encoding

#### Scenario: Audit actor or target has unknown field
- **WHEN** an audit record includes actor or target metadata with an unknown fixed field
- **THEN** the audit schema MUST reject the record before storage or emission

#### Scenario: Protocol audit-event has unknown fixed field
- **WHEN** a protocol `audit-event` message includes an unknown top-level field outside `detail`
- **THEN** the protocol schema MUST reject the message before forwarding, encoding, emitting, or persistence

#### Scenario: Audit detail remains extensible and redacted
- **WHEN** audit detail metadata includes JSON-compatible fields that are not fixed audit record fields
- **THEN** the audit layer SHALL continue to validate JSON compatibility and apply sensitive-field redaction rather than rejecting the detail solely because the key is not predeclared

### Requirement: Audit redaction
The system MUST NOT store raw credentials, raw tokens, raw passwords, raw passphrases, raw pairing codes, keystroke contents, screenshots, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets in audit details.

#### Scenario: Audit details contain sensitive field
- **WHEN** a component writes audit details with a sensitive field name such as token, credential, password, passphrase, pairingCode, keystroke, screenshot, screenData, clipboardText, fileContent, fileBytes, or diagnosticDump
- **THEN** the audit layer redacts the sensitive value before storage or console output

#### Scenario: Remote content metadata identifiers remain inspectable
- **WHEN** audit details include non-content metadata fields such as `fileTransferId`, `diagnosticId`, `diagnosticStatus`, `fileName`, or `profileName`
- **THEN** the audit layer preserves those metadata values unless another sensitive key rule applies

### Requirement: Keylogging audit detail redaction
The shared audit layer SHALL treat audit detail keys that indicate keylogging content as sensitive and redact their values before records are stored, emitted, encoded, or persisted.

#### Scenario: Keylog audit detail is redacted
- **WHEN** a component writes audit details with field names such as `keylog`, `keylogger`, `rawKeylog`, or `keyloggerOutput`
- **THEN** the audit layer MUST replace those values with `[REDACTED]`

#### Scenario: Keylog redaction is recursive
- **WHEN** keylogging-related field names appear inside nested objects or arrays in audit details
- **THEN** the audit layer MUST redact those values recursively while preserving non-sensitive metadata

#### Scenario: Keylog redaction does not create a capability
- **WHEN** audit detail redaction handles a keylogging-related field name
- **THEN** that redaction MUST NOT authorize keylogging, input capture, screen capture, clipboard access, file transfer, diagnostics collection, hidden sessions, or consent bypass

### Requirement: Audit detail redaction covers common authentication keys
The system SHALL redact audit detail fields whose key names indicate common authentication or session secret material, including API keys, authorization headers, auth headers, cookies, set-cookie values, session cookies, and private keys.

#### Scenario: Expanded secret keys are redacted
- **WHEN** a component writes audit details with fields named `apiKey`, `authorization`, `authHeader`, `cookie`, `setCookie`, `sessionCookie`, or `privateKey`
- **THEN** the audit record detail MUST replace those values with `[REDACTED]`

#### Scenario: Expanded secret keys are redacted recursively
- **WHEN** expanded secret-bearing field names appear inside nested objects or arrays in audit details
- **THEN** the audit record detail MUST redact those values recursively

#### Scenario: Non-secret authorization identifiers remain inspectable
- **WHEN** audit details include a non-secret lifecycle identifier such as `authorizationId`
- **THEN** the audit record detail MUST preserve that identifier value unless another sensitive key rule applies

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

### Requirement: Protocol audit-event detail redaction
The system SHALL redact sensitive fields in protocol `audit-event` message details during schema parsing and encoding before the message is emitted, forwarded, or stored by development components. Protocol `audit-event` messages MUST reject blank, whitespace-only, oversized, untrimmed, ASCII control-character, or Unicode bidirectional or zero-width formatting-control action metadata before parsing, forwarding, encoding, or persistence.

#### Scenario: Audit-event detail includes sensitive fields
- **WHEN** an `audit-event` protocol message detail includes fields named token, credential, password, passphrase, pairingCode, keystroke, screenshot, screenData, screenContent, clipboardText, clipboardContents, fileContent, fileData, fileBytes, fileTransfer, diagnosticDump, diagnostics, secret, apiKey, authorization, authHeader, cookie, setCookie, sessionCookie, or privateKey
- **THEN** the protocol schema replaces those values with a redaction marker before returning or encoding the message

#### Scenario: Audit-event detail has nested sensitive fields
- **WHEN** an `audit-event` protocol message detail contains nested objects or arrays with sensitive field names
- **THEN** the protocol schema recursively redacts those sensitive values while preserving non-sensitive metadata

#### Scenario: Audit-event detail preserves non-secret authorization identifiers
- **WHEN** an `audit-event` protocol message detail includes a non-secret lifecycle identifier such as `authorizationId`
- **THEN** the protocol schema preserves that identifier value unless another sensitive key rule applies

#### Scenario: Audit-event detail is omitted
- **WHEN** an `audit-event` protocol message omits detail metadata
- **THEN** the protocol schema accepts the message and uses an empty detail object

#### Scenario: Audit-event action is blank
- **WHEN** an `audit-event` protocol message includes an empty or whitespace-only action
- **THEN** the protocol schema rejects the message before it can be forwarded, encoded, emitted, or persisted with meaningless action metadata

#### Scenario: Audit-event action is untrimmed
- **WHEN** an `audit-event` protocol message includes an action containing leading or trailing whitespace
- **THEN** the protocol schema rejects the message before it can be forwarded, encoded, emitted, or persisted with ambiguous action metadata

#### Scenario: Audit-event action contains unsafe characters
- **WHEN** an `audit-event` protocol message includes an action containing an ASCII control character or Unicode bidirectional or zero-width formatting control including `U+FEFF`
- **THEN** the protocol schema rejects the message before it can be forwarded, encoded, emitted, or persisted with ambiguous action metadata

### Requirement: Audit action secret-bearing metadata rejection
The audit layer SHALL reject audit record `action` values and protocol `audit-event.action` values that contain secret-bearing metadata before local storage, local emission, console output, file persistence, protocol parsing, protocol encoding, forwarding, or development component storage. Secret-bearing action metadata MUST include raw credentials, raw tokens, raw passwords, raw passphrases, raw pairing codes, API keys, authorization headers, auth headers, cookies, set-cookie values, session cookies, access keys, SSH keys, private keys, keystrokes, screenshots, screen data, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets. Rejection errors MUST be bounded and MUST NOT expose the raw action text. Non-secret dotted lifecycle action names SHALL remain accepted.

#### Scenario: Audit record action contains secret-bearing metadata
- **WHEN** a component writes an audit record whose `action` includes secret-bearing metadata such as `token raw-token`, `passphrase raw-passphrase`, `Authorization: Bearer raw-token`, `diagnosticDump: raw-diagnostics`, or `screenContent: raw-screen`
- **THEN** the audit layer MUST reject the record before storage, local emission, console output, or file persistence
- **AND** the thrown validation error MUST NOT include the raw action text or secret marker value

#### Scenario: Protocol audit-event action contains secret-bearing metadata
- **WHEN** a protocol `audit-event` message is parsed or encoded with an `action` that includes secret-bearing metadata
- **THEN** the protocol schema MUST reject the message before it can be forwarded, emitted, encoded, persisted, or stored
- **AND** the thrown validation error MUST NOT include the raw action text or secret marker value

#### Scenario: Non-secret audit action names remain accepted
- **WHEN** a local audit record or protocol `audit-event` uses a non-secret dotted lifecycle action name such as `relay.peer.join.denied` or `agent-shell.authorization.active`
- **THEN** the audit layer and protocol schema MUST preserve the action name and continue normal validation

### Requirement: Access-key and SSH-key audit-event redaction
The protocol schema SHALL redact access-key and SSH-key detail fields in `audit-event` messages during parsing and encoding before the message is emitted, forwarded, or persisted.

#### Scenario: Audit-event parse redacts access-key details
- **WHEN** a protocol `audit-event` detail includes `accessKey` or `sshKey`
- **THEN** protocol parsing MUST replace those values with `[REDACTED]`

#### Scenario: Audit-event encode redacts access-key details
- **WHEN** a protocol `audit-event` is encoded with `accessKey` or `sshKey` in detail metadata
- **THEN** protocol encoding MUST replace those values with `[REDACTED]` and MUST NOT include the raw values in the encoded JSON

### Requirement: Private audit detail metadata redaction
The system SHALL redact audit detail fields whose key names commonly carry raw user display-name metadata or private lifecycle reason text, while preserving bounded non-secret reason metadata.

#### Scenario: Audit details contain raw display-name metadata
- **WHEN** a component writes audit details with fields named `displayName`, `hostDisplayName`, `viewerDisplayName`, or `deviceDisplayName`
- **THEN** the audit layer MUST replace those values with `[REDACTED]` before storage, local emission, console output, file persistence, or protocol `audit-event` encoding

#### Scenario: Audit details contain raw private reason text
- **WHEN** a component writes audit details with fields named `reason`, `reasonText`, `rawReason`, `denialReason`, `revokeReason`, `pauseReason`, `resumeReason`, or `terminationReason`
- **THEN** the audit layer MUST replace those values with `[REDACTED]` before storage, local emission, console output, file persistence, or protocol `audit-event` encoding

#### Scenario: Safe reason metadata remains inspectable
- **WHEN** audit details include bounded metadata fields such as `reasonCode`, `reasonConfigured`, or `authorizationId`
- **THEN** the audit layer preserves those metadata values unless another sensitive key rule applies

#### Scenario: Private audit detail metadata is redacted recursively
- **WHEN** display-name or private-reason field names appear inside nested objects or arrays in audit details
- **THEN** the audit layer MUST redact those values recursively while preserving non-sensitive metadata

### Requirement: In-memory audit history immutability
The in-memory audit sink SHALL retain audit records as immutable validated and redacted snapshots after write.

#### Scenario: Write result is immutable
- **WHEN** a component writes an audit record to the in-memory audit sink
- **THEN** the returned audit record and nested detail objects are immutable

#### Scenario: Stored audit history resists mutation
- **WHEN** caller code attempts to mutate audit records returned by `records()`
- **THEN** the retained in-memory audit history remains unchanged

#### Scenario: In-memory audit inspection order remains stable
- **WHEN** multiple immutable audit records are written to the in-memory audit sink
- **THEN** `records()` returns them in write order without exposing the sink's internal entry array for mutation

### Requirement: Audit detail JSON compatibility
The system SHALL accept only JSON-compatible values in audit record detail metadata and protocol `audit-event` detail metadata. Audit details MUST reject values that cannot be represented faithfully in JSON, including functions, symbols, bigint, `undefined`, `NaN`, `Infinity`, `-Infinity`, cyclic values, own symbol-keyed properties, own non-enumerable properties, accessor properties, sparse arrays, and non-index array properties. Audit details MUST reject property names containing ASCII control characters or Unicode bidirectional or zero-width formatting controls including `U+FEFF`.

#### Scenario: Audit record detail accepts JSON values
- **WHEN** a component creates an audit record whose detail contains strings, finite numbers, booleans, null, arrays, and nested objects with safe property names
- **THEN** the audit layer accepts the record and preserves the JSON-compatible detail values after redaction

#### Scenario: Audit record detail rejects non-JSON values
- **WHEN** a component creates an audit record whose detail contains a function, symbol, bigint, `undefined`, `NaN`, `Infinity`, `-Infinity`, cyclic value, own symbol-keyed property, own non-enumerable property, accessor property, sparse array, or non-index array property
- **THEN** the audit layer rejects the record before it is stored, emitted, or persisted

#### Scenario: Audit record detail rejects unsafe property names
- **WHEN** a component creates an audit record whose detail metadata contains a property name with an ASCII control character or Unicode bidirectional or zero-width formatting control including `U+FEFF`
- **THEN** the audit layer rejects the record before it is stored, emitted, or persisted
- **AND** diagnostics MUST NOT expose the raw unsafe property name

#### Scenario: Protocol audit-event detail accepts JSON values
- **WHEN** a protocol `audit-event` message detail contains strings, finite numbers, booleans, null, arrays, and nested objects with safe property names
- **THEN** the protocol schema accepts the message and preserves the JSON-compatible detail values after redaction

#### Scenario: Protocol audit-event detail rejects non-JSON values
- **WHEN** a protocol `audit-event` message detail contains a function, symbol, bigint, `undefined`, `NaN`, `Infinity`, `-Infinity`, cyclic value, own symbol-keyed property, own non-enumerable property, accessor property, sparse array, or non-index array property
- **THEN** the protocol schema rejects the message before parsing, encoding, forwarding, emitting, or persistence

#### Scenario: Protocol audit-event detail rejects unsafe property names
- **WHEN** a protocol `audit-event` message detail contains a property name with an ASCII control character or Unicode bidirectional or zero-width formatting control including `U+FEFF`
- **THEN** the protocol schema rejects the message before parsing, encoding, forwarding, emitting, or persistence
- **AND** diagnostics MUST NOT expose the raw unsafe property name

#### Scenario: Audit detail redaction remains recursive
- **WHEN** accepted JSON-compatible audit details contain sensitive field names inside nested objects or arrays
- **THEN** the audit layer recursively redacts those sensitive values while preserving non-sensitive JSON-compatible metadata

### Requirement: Secret-bearing authorization identifiers are redacted in audit detail
The audit layer SHALL redact audit detail values whose key is `authorizationId` when the value is not a string or when the value contains secret-bearing metadata such as token, credential, password, passphrase, cookie, API key, access key, private key, SSH key, authorization header, or auth header markers. Redaction MUST occur before local storage, local emission, console output, file persistence, protocol `audit-event` parsing, protocol `audit-event` encoding, or relay forwarding. Non-secret string authorization identifiers MUST remain inspectable.

#### Scenario: Secret-bearing audit detail authorization id is redacted
- **WHEN** a component writes audit detail metadata with `authorizationId` containing token, credential, password, passphrase, cookie, API-key, access-key, private-key, SSH-key, authorization-header, or auth-header markers
- **THEN** the audit layer replaces that value with `[REDACTED]` before storage, emission, encoding, persistence, or forwarding
- **AND** raw secret marker values MUST NOT appear in the resulting audit record or protocol `audit-event`

#### Scenario: Non-secret audit detail authorization id remains inspectable
- **WHEN** a component writes audit detail metadata with a schema-valid non-secret `authorizationId`
- **THEN** the audit layer preserves that identifier value unless another sensitive key rule applies

#### Scenario: Non-string audit detail authorization id is redacted
- **WHEN** a component writes audit detail metadata with `authorizationId` as an object, array, number, boolean, or null
- **THEN** the audit layer replaces that value with `[REDACTED]` before storage, emission, encoding, persistence, or forwarding
