## ADDED Requirements

### Requirement: Canonical agent shell relay tokens
The agent shell SHALL reject malformed relay shared-token option values before opening a relay connection or sending any protocol message. Malformed token option values MUST include non-string, blank, whitespace-only, untrimmed, control-character, or oversized values.

#### Scenario: CLI token option is untrimmed
- **WHEN** the agent shell is started with a `--token` value containing leading or trailing whitespace
- **THEN** CLI argument parsing MUST fail through bounded usage handling before runtime start or relay connection setup

#### Scenario: Direct runtime token is untrimmed
- **WHEN** caller code creates a managed runtime with a token option containing leading or trailing whitespace
- **THEN** runtime creation MUST fail before opening a relay connection or sending join, authorization, lifecycle, signal, or audit messages

#### Scenario: Agent token rejection is secret-safe
- **WHEN** CLI or direct runtime token validation rejects a token value
- **THEN** thrown errors, startup diagnostics, runtime events, and logs MUST NOT expose the raw token, token whitespace shape, relay URL credentials, pairing codes, protocol payloads, private reasons, keystrokes, screenshots, screen contents, or input contents
