## ADDED Requirements

### Requirement: Protocol rejects secret-bearing display names
The relay and agents SHALL reject protocol display-name metadata that contains secret-bearing metadata before accepting, forwarding, or using it as trusted peer metadata. Secret-bearing metadata MUST include raw token, credential, password, passphrase, pairing-code, API-key, authorization-header, auth-header, cookie, private-key, SSH-key, keystroke, screenshot, screen-data, screen-content, clipboard-content, file-transfer content/data/bytes, diagnostics content/dump, or secret markers when they appear with values. Rejection diagnostics, relay errors, runtime events, and logs MUST NOT expose the raw display-name text.

#### Scenario: Hello display name contains secret-bearing metadata
- **WHEN** a peer sends a `hello` protocol message whose `displayName` contains secret-bearing metadata
- **THEN** the receiver rejects the message before accepting or forwarding it as trusted peer metadata
- **AND** diagnostics do not expose the raw display-name text

#### Scenario: Safe hello display name remains accepted
- **WHEN** a peer sends a `hello` protocol message with a concise non-secret display name
- **THEN** protocol validation accepts the display name when all other message invariants are valid
