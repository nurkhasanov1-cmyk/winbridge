## ADDED Requirements

### Requirement: Immutable shared audit record snapshots
The shared audit record factory SHALL return immutable audit record snapshots after successful schema validation and sensitive metadata redaction. Immutability MUST include nested actor, target, and detail metadata, including arrays and redacted nested objects, and MUST prevent callers from changing trusted audit evidence in place after creation.

#### Scenario: Audit record metadata cannot be changed
- **WHEN** a component creates a schema-valid audit record through the shared audit factory
- **THEN** the returned record, actor metadata, optional target metadata, and detail metadata are immutable
- **AND** callers cannot change the action, outcome, actor, target, session, reason, or event identifiers in place

#### Scenario: Redacted audit evidence cannot be restored
- **WHEN** a component creates an audit record whose reason or detail metadata is redacted during creation
- **THEN** the returned record and nested redacted metadata are immutable
- **AND** callers cannot restore raw sensitive values in place before local emission, console output, file persistence, relay use, or test inspection

#### Scenario: Audit output shape remains JSON-compatible
- **WHEN** an immutable audit record is serialized by existing audit sinks or shared JSON helpers
- **THEN** the emitted JSON-compatible shape remains the same validated and redacted audit record data
- **AND** immutability does not add audit fields, permissions, remote actions, hidden behavior, or logging sinks
