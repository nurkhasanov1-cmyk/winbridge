## MODIFIED Requirements

### Requirement: Agent signal payload JSON compatibility
The agent shell SHALL inherit shared protocol `signal.payload` JSON-compatible object validation and sensitive remote-assistance key rejection for public runtime sends and inbound messages. This validation MUST NOT weaken existing signal authorization, routing, redaction, or consent gates.

#### Scenario: Public send rejects non-JSON signal payload
- **WHEN** caller code invokes public runtime `send()` with a `signal` payload containing a non-JSON value or property shape
- **THEN** the runtime rejects the send before socket write and before local `sent` event emission

#### Scenario: Public send rejects access-key and SSH-key signal payload
- **WHEN** caller code invokes public runtime `send()` with a `signal` payload containing access-key or SSH-key field names such as `accessKey`, `access_key`, `access-key`, `sshKey`, or `ssh_key` at any nesting level
- **THEN** the runtime rejects the send before socket write and before local `sent` event emission
- **AND** local events and logs MUST NOT expose raw access-key or SSH-key values

#### Scenario: Inbound non-JSON signal payload is not trusted
- **WHEN** the agent shell receives a decoded `signal` message whose payload contains a non-JSON value or property shape
- **THEN** shared protocol validation rejects the message before local `received` protocol event emission or received signal summary logging

#### Scenario: Inbound access-key and SSH-key signal payload is not trusted
- **WHEN** the agent shell receives a decoded `signal` message whose payload contains access-key or SSH-key field names such as `accessKey`, `access_key`, `access-key`, `sshKey`, or `ssh_key` at any nesting level
- **THEN** shared protocol validation rejects the message before local `received` protocol event emission or received signal summary logging
- **AND** local events and logs MUST NOT expose raw access-key or SSH-key values

#### Scenario: Signal JSON validation does not grant access
- **WHEN** a `signal` payload is JSON-compatible and does not contain sensitive remote-assistance key fields
- **THEN** JSON compatibility alone MUST NOT authorize screen capture, input, clipboard access, file transfer, diagnostics, reconnect, hidden sessions, or consent bypass
