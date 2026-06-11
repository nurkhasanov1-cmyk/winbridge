## ADDED Requirements

### Requirement: Agent shell CLI unexpected errors are secret-safe
The agent shell CLI SHALL report unexpected startup and shutdown failures without exposing raw exception messages, stack traces, local file paths, relay tokens, pairing codes, credentials, protocol payload fragments, private workflow reason text, keystrokes, screenshots, screen contents, or input contents.

#### Scenario: Unexpected startup failure output is metadata-only
- **WHEN** the agent shell CLI reports an unexpected startup failure
- **THEN** stderr output MUST include a generic agent-shell error diagnostic with summary metadata such as raw message byte length
- **AND** stderr output MUST NOT include the raw exception message or stack trace

#### Scenario: Unexpected shutdown failure output is metadata-only
- **WHEN** the agent shell CLI reports an unexpected shutdown failure
- **THEN** stderr output MUST include a generic agent-shell error diagnostic with summary metadata such as raw message byte length
- **AND** stderr output MUST NOT include the raw exception message or stack trace

#### Scenario: Usage errors remain bounded
- **WHEN** the agent shell CLI rejects malformed arguments with a usage error
- **THEN** stderr output MAY include the static usage text
- **AND** stderr output MUST NOT include raw user-provided argument values
