## MODIFIED Requirements

### Requirement: Testable bounded relay rejection reasons
The relay runtime SHALL expose integration-test coverage proving malformed peer messages receive bounded secret-safe relay error and audit reasons, including authorization-related protocol messages whose `reason` fields, protocol `audit-event` action metadata, or protocol `audit-event.detail` property names contain ASCII control characters or Unicode bidirectional or zero-width formatting controls including `U+FEFF`.

#### Scenario: Runtime rejects malformed protocol with bounded reason
- **WHEN** integration tests send malformed protocol input to a registered peer connection
- **THEN** the sender receives a bounded relay error reason and the remaining peer receives no forwarded protocol message

#### Scenario: Runtime audit omits malformed payload details
- **WHEN** the relay audits the malformed protocol rejection
- **THEN** the audit reason and detail do not contain the raw malformed message contents

#### Scenario: Runtime rejects malformed authorization reason before forwarding
- **WHEN** integration tests send a registered authorization-related protocol message with a malformed reason field
- **THEN** the sender receives a bounded relay error reason and the remaining peer receives no forwarded authorization message
- **AND** relay audit records and peer-facing diagnostics MUST NOT expose the raw malformed reason text

#### Scenario: Runtime rejects malformed audit-event action before forwarding
- **WHEN** integration tests send a registered protocol `audit-event` message with malformed action metadata
- **THEN** the sender receives a bounded relay error reason and the remaining peer receives no forwarded audit-event message
- **AND** relay audit records and peer-facing diagnostics MUST NOT expose the raw malformed action text

#### Scenario: Runtime rejects malformed audit-event detail key before forwarding
- **WHEN** integration tests send a registered protocol `audit-event` message with a malformed detail property name
- **THEN** the sender receives a bounded relay error reason and the remaining peer receives no forwarded audit-event message
- **AND** relay audit records and peer-facing diagnostics MUST NOT expose the raw malformed detail property name
