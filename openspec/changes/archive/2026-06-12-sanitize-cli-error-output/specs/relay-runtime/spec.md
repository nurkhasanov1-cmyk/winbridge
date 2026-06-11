## ADDED Requirements

### Requirement: Relay CLI unexpected errors are secret-safe
The relay CLI SHALL report unexpected startup and shutdown failures without exposing raw exception messages, stack traces, local file paths, shared tokens, pairing codes, credentials, protocol payload fragments, keystrokes, screenshots, screen contents, or input contents.

#### Scenario: Startup failure output is metadata-only
- **WHEN** the relay CLI reports an unexpected startup failure
- **THEN** stderr output MUST include a generic relay error diagnostic with summary metadata such as raw message byte length
- **AND** stderr output MUST NOT include the raw exception message or stack trace

#### Scenario: Shutdown failure output is metadata-only
- **WHEN** the relay CLI reports an unexpected shutdown failure
- **THEN** stderr output MUST include a generic relay error diagnostic with summary metadata such as raw message byte length
- **AND** stderr output MUST NOT include the raw exception message or stack trace
