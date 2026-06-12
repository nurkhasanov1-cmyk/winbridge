## ADDED Requirements

### Requirement: File sink keylogging redaction
The file audit sink SHALL apply shared keylogging-related audit detail redaction before appending JSONL records.

#### Scenario: Keylog detail is persisted redacted
- **WHEN** a file audit sink writes an audit record whose detail contains keylogging-related field names such as `keylog` or `keyloggerOutput`
- **THEN** the persisted JSON line contains redacted placeholders instead of raw keylogging values

#### Scenario: Non-sensitive file audit metadata remains inspectable
- **WHEN** a file audit sink writes an audit record whose detail contains non-sensitive operational metadata alongside keylogging-related fields
- **THEN** the persisted JSON line preserves the non-sensitive metadata unless another sensitive key rule applies
