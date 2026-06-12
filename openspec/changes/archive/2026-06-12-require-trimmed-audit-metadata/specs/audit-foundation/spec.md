## ADDED Requirements

### Requirement: Canonical audit semantic metadata
The audit layer SHALL reject audit record semantic metadata when action, optional top-level reason, or target type is blank, oversized, or not already trimmed. Protocol `audit-event` action metadata MUST follow the same canonical rule before parsing, forwarding, encoding, emitting, or persistence.

#### Scenario: Audit record action is untrimmed
- **WHEN** a component creates or writes an audit record whose `action` contains leading or trailing whitespace
- **THEN** the audit schema MUST reject the record before storage, local emission, console output, file persistence, or protocol encoding

#### Scenario: Audit record reason is untrimmed
- **WHEN** a component creates or writes an audit record whose top-level `reason` contains leading or trailing whitespace
- **THEN** the audit schema MUST reject the record before storage, local emission, console output, file persistence, or protocol encoding

#### Scenario: Audit record target type is untrimmed
- **WHEN** a component creates or writes an audit record whose `target.type` contains leading or trailing whitespace
- **THEN** the audit schema MUST reject the record before storage, local emission, console output, file persistence, or protocol encoding

#### Scenario: Protocol audit-event action is untrimmed
- **WHEN** a protocol `audit-event` message includes an `action` containing leading or trailing whitespace
- **THEN** the protocol schema MUST reject the message before forwarding, encoding, emitting, or persistence

#### Scenario: Audit metadata rejection is non-authorizing
- **WHEN** canonical audit metadata validation rejects malformed input
- **THEN** the rejection MUST NOT approve a session, activate host visibility, grant permissions, start capture, send input, reconnect a peer, suppress visibility, or bypass consent workflows
