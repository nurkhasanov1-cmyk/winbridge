## ADDED Requirements

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
