## ADDED Requirements

### Requirement: Audit detail JSON compatibility
The system SHALL accept only JSON-compatible values in audit record detail metadata and protocol `audit-event` detail metadata. Audit details MUST reject values that cannot be represented faithfully in JSON, including functions, symbols, bigint, `undefined`, `NaN`, `Infinity`, `-Infinity`, cyclic values, own symbol-keyed properties, own non-enumerable properties, accessor properties, sparse arrays, and non-index array properties.

#### Scenario: Audit record detail accepts JSON values
- **WHEN** a component creates an audit record whose detail contains strings, finite numbers, booleans, null, arrays, and nested objects
- **THEN** the audit layer accepts the record and preserves the JSON-compatible detail values after redaction

#### Scenario: Audit record detail rejects non-JSON values
- **WHEN** a component creates an audit record whose detail contains a function, symbol, bigint, `undefined`, `NaN`, `Infinity`, `-Infinity`, cyclic value, own symbol-keyed property, own non-enumerable property, accessor property, sparse array, or non-index array property
- **THEN** the audit layer rejects the record before it is stored, emitted, or persisted

#### Scenario: Protocol audit-event detail accepts JSON values
- **WHEN** a protocol `audit-event` message detail contains strings, finite numbers, booleans, null, arrays, and nested objects
- **THEN** the protocol schema accepts the message and preserves the JSON-compatible detail values after redaction

#### Scenario: Protocol audit-event detail rejects non-JSON values
- **WHEN** a protocol `audit-event` message detail contains a function, symbol, bigint, `undefined`, `NaN`, `Infinity`, `-Infinity`, cyclic value, own symbol-keyed property, own non-enumerable property, accessor property, sparse array, or non-index array property
- **THEN** the protocol schema rejects the message before parsing, encoding, forwarding, emitting, or persistence

#### Scenario: Audit detail redaction remains recursive
- **WHEN** accepted JSON-compatible audit details contain sensitive field names inside nested objects or arrays
- **THEN** the audit layer recursively redacts those sensitive values while preserving non-sensitive JSON-compatible metadata
