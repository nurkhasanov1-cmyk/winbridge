## ADDED Requirements

### Requirement: Protocol display-name metadata remains canonical
The relay and agents SHALL reject protocol display-name metadata that is not already trimmed before accepting, forwarding, emitting, or using it as trusted peer or consent metadata.

#### Scenario: Hello display name is untrimmed
- **WHEN** a peer sends a `hello` protocol message whose `displayName` has leading or trailing whitespace
- **THEN** the receiver rejects the message before accepting or forwarding it as trusted peer metadata

#### Scenario: Relay rejection remains secret-safe
- **WHEN** the relay rejects protocol input because display-name metadata is untrimmed
- **THEN** the peer-facing relay error and audit reason MUST NOT include raw display names, raw protocol payloads, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, or full secrets
