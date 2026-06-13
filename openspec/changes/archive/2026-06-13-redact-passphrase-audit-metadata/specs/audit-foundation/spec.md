## MODIFIED Requirements

### Requirement: Audit redaction
The system MUST NOT store raw credentials, raw tokens, raw passwords, raw passphrases, raw pairing codes, keystroke contents, screenshots, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets in audit details.

#### Scenario: Audit details contain sensitive field
- **WHEN** a component writes audit details with a sensitive field name such as token, credential, password, passphrase, pairingCode, keystroke, screenshot, screenData, clipboardText, fileContent, fileBytes, or diagnosticDump
- **THEN** the audit layer redacts the sensitive value before storage or console output

#### Scenario: Remote content metadata identifiers remain inspectable
- **WHEN** audit details include non-content metadata fields such as `fileTransferId`, `diagnosticId`, `diagnosticStatus`, `fileName`, or `profileName`
- **THEN** the audit layer preserves those metadata values unless another sensitive key rule applies

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
