## ADDED Requirements

### Requirement: Canonical development shared tokens
The relay and agents SHALL treat development shared-token values as canonical credential strings that must be non-blank, bounded, ASCII-control-free, and already trimmed before relay admission. Shared-token validation and comparison MUST NOT store, forward, echo, log, or audit raw token values.

#### Scenario: Configured shared token is untrimmed
- **WHEN** the relay or an agent is configured with a development shared-token value containing leading or trailing whitespace
- **THEN** that component MUST reject the value before listener startup, relay connection setup, room registration, or protocol message exchange

#### Scenario: Presented shared token is padded
- **WHEN** the relay is configured with a trimmed shared token and a peer presents a token query value with leading or trailing whitespace
- **THEN** the relay MUST reject the connection before room registration because exact token comparison fails

#### Scenario: Shared token rejection is secret-safe
- **WHEN** shared-token validation or comparison rejects a configured or presented token
- **THEN** diagnostics, close reasons, audit records, runtime events, and logs MUST NOT include the raw configured token, raw presented token, token whitespace shape, pairing codes, credentials, protocol payloads, keystrokes, screenshots, screen contents, or full secrets

#### Scenario: Shared token validation is not authorization
- **WHEN** a development shared token is canonical and matches exactly
- **THEN** the token match MUST NOT approve host consent, activate host visibility, grant permissions, start capture, send input, reconnect a peer, suppress visibility, or bypass session authorization workflows
