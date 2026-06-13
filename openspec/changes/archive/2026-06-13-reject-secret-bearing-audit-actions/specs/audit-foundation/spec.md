## ADDED Requirements

### Requirement: Audit action secret-bearing metadata rejection
The audit layer SHALL reject audit record `action` values and protocol `audit-event.action` values that contain secret-bearing metadata before local storage, local emission, console output, file persistence, protocol parsing, protocol encoding, forwarding, or development component storage. Secret-bearing action metadata MUST include raw credentials, raw tokens, raw pairing codes, API keys, authorization headers, auth headers, cookies, set-cookie values, session cookies, access keys, SSH keys, private keys, keystrokes, screenshots, screen data, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets. Rejection errors MUST be bounded and MUST NOT expose the raw action text. Non-secret dotted lifecycle action names SHALL remain accepted.

#### Scenario: Audit record action contains secret-bearing metadata
- **WHEN** a component writes an audit record whose `action` includes secret-bearing metadata such as `token raw-token`, `Authorization: Bearer raw-token`, `diagnosticDump: raw-diagnostics`, or `screenContent: raw-screen`
- **THEN** the audit layer MUST reject the record before storage, local emission, console output, or file persistence
- **AND** the thrown validation error MUST NOT include the raw action text or secret marker value

#### Scenario: Protocol audit-event action contains secret-bearing metadata
- **WHEN** a protocol `audit-event` message is parsed or encoded with an `action` that includes secret-bearing metadata
- **THEN** the protocol schema MUST reject the message before it can be forwarded, emitted, encoded, persisted, or stored
- **AND** the thrown validation error MUST NOT include the raw action text or secret marker value

#### Scenario: Non-secret audit action names remain accepted
- **WHEN** a local audit record or protocol `audit-event` uses a non-secret dotted lifecycle action name such as `relay.peer.join.denied` or `agent-shell.authorization.active`
- **THEN** the audit layer and protocol schema MUST preserve the action name and continue normal validation
