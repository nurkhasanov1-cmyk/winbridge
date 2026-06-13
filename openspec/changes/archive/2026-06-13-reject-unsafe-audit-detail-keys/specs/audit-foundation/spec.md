## MODIFIED Requirements

### Requirement: Audit detail JSON compatibility
The system SHALL accept only JSON-compatible values in audit record detail metadata and protocol `audit-event` detail metadata. Audit details MUST reject values that cannot be represented faithfully in JSON, including functions, symbols, bigint, `undefined`, `NaN`, `Infinity`, `-Infinity`, cyclic values, own symbol-keyed properties, own non-enumerable properties, accessor properties, sparse arrays, and non-index array properties. Audit details MUST reject property names containing ASCII control characters or Unicode bidirectional or zero-width formatting controls including `U+FEFF`.

#### Scenario: Audit record detail accepts JSON values
- **WHEN** a component creates an audit record whose detail contains strings, finite numbers, booleans, null, arrays, and nested objects with safe property names
- **THEN** the audit layer accepts the record and preserves the JSON-compatible detail values after redaction

#### Scenario: Audit record detail rejects non-JSON values
- **WHEN** a component creates an audit record whose detail contains a function, symbol, bigint, `undefined`, `NaN`, `Infinity`, `-Infinity`, cyclic value, own symbol-keyed property, own non-enumerable property, accessor property, sparse array, or non-index array property
- **THEN** the audit layer rejects the record before it is stored, emitted, or persisted

#### Scenario: Audit record detail rejects unsafe property names
- **WHEN** a component creates an audit record whose detail metadata contains a property name with an ASCII control character or Unicode bidirectional or zero-width formatting control including `U+FEFF`
- **THEN** the audit layer rejects the record before it is stored, emitted, or persisted
- **AND** diagnostics MUST NOT expose the raw unsafe property name

#### Scenario: Protocol audit-event detail accepts JSON values
- **WHEN** a protocol `audit-event` message detail contains strings, finite numbers, booleans, null, arrays, and nested objects with safe property names
- **THEN** the protocol schema accepts the message and preserves the JSON-compatible detail values after redaction

#### Scenario: Protocol audit-event detail rejects non-JSON values
- **WHEN** a protocol `audit-event` message detail contains a function, symbol, bigint, `undefined`, `NaN`, `Infinity`, `-Infinity`, cyclic value, own symbol-keyed property, own non-enumerable property, accessor property, sparse array, or non-index array property
- **THEN** the protocol schema rejects the message before it can be forwarded, encoded, emitted, or persisted

#### Scenario: Protocol audit-event detail rejects unsafe property names
- **WHEN** a protocol `audit-event` message detail contains a property name with an ASCII control character or Unicode bidirectional or zero-width formatting control including `U+FEFF`
- **THEN** the protocol schema rejects the message before it can be forwarded, encoded, emitted, or persisted
- **AND** diagnostics MUST NOT expose the raw unsafe property name
