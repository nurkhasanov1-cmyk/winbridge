## ADDED Requirements

### Requirement: Canonical signal event byte-length metadata
The agent shell SHALL calculate redacted sent and received `signal` runtime event byte-length metadata using the shared canonical JSON byte length, and inherited `toJSON` hooks or prototype pollution MUST NOT alter that metadata.

#### Scenario: Sent signal byte length ignores inherited toJSON hooks
- **WHEN** the managed runtime emits a local `sent` event for a valid `signal` while an inherited `toJSON` hook is present
- **THEN** the event payload remains redacted
- **AND** the event byte length equals the canonical JSON byte length of the signal payload
- **AND** the event MUST NOT expose raw signal payload contents or fields injected by inherited `toJSON` hooks

#### Scenario: Received signal byte length ignores inherited toJSON hooks
- **WHEN** the managed runtime emits a local `received` event for a valid `signal` while an inherited `toJSON` hook is present
- **THEN** the event payload remains redacted
- **AND** the event byte length equals the canonical JSON byte length of the signal payload
- **AND** the event MUST NOT expose raw signal payload contents or fields injected by inherited `toJSON` hooks
