## ADDED Requirements

### Requirement: Raw runtime events are secret-safe
The agent shell SHALL emit local `raw` runtime events without exposing raw non-protocol inbound text, parser details, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, or input contents.

#### Scenario: Non-protocol inbound text is redacted
- **WHEN** the managed runtime receives inbound text that cannot be decoded as a protocol envelope
- **THEN** the local `raw` runtime event MUST expose only secret-safe metadata such as byte length and MUST NOT expose the original text

#### Scenario: Relay parser details are not exposed
- **WHEN** the managed runtime receives a relay rejection or other malformed inbound text that includes parser details or raw payload fragments
- **THEN** the local `raw` runtime event MUST NOT expose those details or fragments
