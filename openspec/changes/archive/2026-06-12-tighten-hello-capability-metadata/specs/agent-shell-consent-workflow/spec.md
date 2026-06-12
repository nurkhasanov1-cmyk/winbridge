## ADDED Requirements

### Requirement: Hello capability metadata remains canonical
The agent shell SHALL rely on shared protocol validation for generated, inbound, and public-send `hello` capability metadata. `hello` capability metadata that is blank, untrimmed, or duplicate after trimming MUST be rejected before it can create peer presence, authorize public sends, emit trusted local `received` or `sent` events, or trigger consent workflow messages.

#### Scenario: Inbound untrimmed capability is rejected
- **WHEN** the runtime receives a `hello`-shaped payload whose capability entry has leading or trailing whitespace
- **THEN** the runtime rejects it before local `received` protocol event emission or peer presence handling

#### Scenario: Inbound trim-duplicate capability is rejected
- **WHEN** the runtime receives a `hello`-shaped payload with capability entries that duplicate after trimming
- **THEN** the runtime rejects it before local `received` protocol event emission or peer presence handling

#### Scenario: Public hello with untrimmed capability is blocked
- **WHEN** caller code invokes public runtime `send()` with a same-session `hello` whose capability entry has leading or trailing whitespace
- **THEN** the runtime rejects the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked hello

#### Scenario: Rejected capability diagnostics remain secret-safe
- **WHEN** the runtime rejects a `hello` because of malformed capability metadata
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw capability values, protocol payloads, display names, tokens, pairing codes, private reasons, keystrokes, screenshots, screen contents, or input contents
