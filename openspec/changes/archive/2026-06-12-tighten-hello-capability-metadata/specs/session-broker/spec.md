## MODIFIED Requirements

### Requirement: Message schema validation
The relay and agents SHALL validate protocol envelopes before accepting or forwarding messages, protocol display-name metadata SHALL be non-blank after trimming whitespace, `hello` capability metadata SHALL be non-blank, already trimmed, and unique after trimming, and relay rejection errors for malformed protocol input SHALL use bounded secret-safe reasons.

#### Scenario: Invalid protocol message
- **WHEN** a peer sends malformed JSON or an unknown protocol message
- **THEN** the receiver rejects the message and emits an audit/error event without forwarding it as trusted data

#### Scenario: Blank hello display name
- **WHEN** a peer sends a `hello` protocol message with an empty or whitespace-only display name
- **THEN** the receiver rejects the message before accepting or forwarding it as trusted peer metadata

#### Scenario: Blank hello capability
- **WHEN** a peer sends a `hello` protocol message with an empty or whitespace-only capability entry
- **THEN** the receiver rejects the message before accepting or forwarding it as trusted peer metadata

#### Scenario: Untrimmed hello capability
- **WHEN** a peer sends a `hello` protocol message with a capability entry that has leading or trailing whitespace
- **THEN** the receiver rejects the message before accepting or forwarding it as trusted peer metadata

#### Scenario: Duplicate hello capability
- **WHEN** a peer sends a `hello` protocol message with duplicate capability entries after trimming
- **THEN** the receiver rejects the message before accepting or forwarding ambiguous peer metadata

#### Scenario: Malformed protocol rejection reason is bounded
- **WHEN** the relay rejects malformed JSON or schema-invalid protocol input
- **THEN** the peer-facing relay error and audit reason MUST NOT include raw protocol payloads, parser internals, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, or full secrets
