## ADDED Requirements

### Requirement: Immutable parsed protocol envelopes
The shared protocol parser SHALL return immutable protocol envelope snapshots after successful schema validation. Immutability MUST include nested arrays and JSON object fields such as capabilities, requested permissions, granted permissions, authorization state permissions, signal payloads, and audit event details, and MUST prevent callers from changing trusted protocol state in place after validation.

#### Scenario: Parsed authorization envelope cannot be widened
- **WHEN** an authorization-related protocol envelope is accepted by the shared parser
- **THEN** the returned envelope and any permission arrays are immutable
- **AND** callers cannot add permissions, change authorization status, change host visibility, or change actor/sender metadata in place

#### Scenario: Parsed signal payload cannot be changed
- **WHEN** a `signal` envelope with a schema-valid payload is accepted by the shared parser
- **THEN** the returned envelope and nested payload objects are immutable
- **AND** callers cannot add, remove, or replace signal payload fields in place before relay forwarding or agent workflow processing

#### Scenario: Parsed audit detail cannot be restored after redaction
- **WHEN** an `audit-event` envelope is accepted and sensitive detail fields are redacted
- **THEN** the returned envelope and nested detail objects are immutable
- **AND** callers cannot restore raw sensitive detail values in place after validation
