## ADDED Requirements

### Requirement: Agent shell display names remain canonical
The agent shell SHALL reject CLI and direct runtime display-name values that are not already trimmed before opening a relay connection, sending `join-session`, sending `hello`, emitting trusted local protocol events, or running consent workflow handling.

#### Scenario: CLI display name is untrimmed
- **WHEN** the agent shell is started with a `--name` value that has leading or trailing whitespace
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Direct runtime display name is untrimmed
- **WHEN** caller code creates a managed runtime with a display name that has leading or trailing whitespace
- **THEN** runtime creation fails before opening a relay connection or sending any protocol message

#### Scenario: Inbound untrimmed hello display name is rejected
- **WHEN** the runtime receives a `hello`-shaped payload whose display name has leading or trailing whitespace
- **THEN** the runtime rejects it before local `received` protocol event emission or peer presence handling

#### Scenario: Public hello with untrimmed display name is blocked
- **WHEN** caller code invokes public runtime `send()` with a same-session `hello` whose display name has leading or trailing whitespace
- **THEN** the runtime rejects the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked hello

#### Scenario: Rejected display-name diagnostics remain secret-safe
- **WHEN** the runtime rejects display-name metadata because it is malformed
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw display names, protocol payloads, tokens, pairing codes, private reasons, keystrokes, screenshots, screen contents, or input contents
