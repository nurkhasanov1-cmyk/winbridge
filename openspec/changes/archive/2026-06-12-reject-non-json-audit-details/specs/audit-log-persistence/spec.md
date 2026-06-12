## ADDED Requirements

### Requirement: File audit detail JSON compatibility
The file audit sink SHALL reject audit records whose detail metadata contains non-JSON values before appending to the JSONL audit file.

#### Scenario: File sink rejects non-JSON detail before writing
- **WHEN** a file audit sink is asked to write an audit record whose detail contains a function, symbol, bigint, `undefined`, `NaN`, `Infinity`, `-Infinity`, cyclic value, own symbol-keyed property, own non-enumerable property, accessor property, sparse array, or non-index array property
- **THEN** the write fails and no partial audit record is appended for that event

#### Scenario: File sink writes JSON-compatible detail
- **WHEN** a file audit sink is asked to write an audit record whose detail contains JSON-compatible values
- **THEN** the persisted JSON line contains one schema-valid audit record with those detail values after redaction
