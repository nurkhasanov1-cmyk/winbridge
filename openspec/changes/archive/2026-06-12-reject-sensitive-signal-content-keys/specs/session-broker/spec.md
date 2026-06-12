## MODIFIED Requirements

### Requirement: Signal payload safety
The relay and agents SHALL reject `signal` protocol messages whose payload is empty, exceeds the configured protocol payload size bound, or contains keys that indicate raw tokens, credentials, pairing codes, API keys, authorization headers, auth headers, cookies, private keys, keystrokes, screenshots, screen data, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or secrets. Non-secret lifecycle identifiers such as `authorizationId` MUST remain permitted.

#### Scenario: Small signaling payload is accepted
- **WHEN** a registered peer sends a `signal` message containing a non-empty small signaling payload without sensitive key names
- **THEN** the relay accepts the message as schema-valid and may forward it to the remaining peer

#### Scenario: Lifecycle authorization identifier is accepted
- **WHEN** a registered peer sends a `signal` message containing `authorizationId` as a non-secret lifecycle identifier and no sensitive key names
- **THEN** the relay accepts the message as schema-valid and may forward it to the remaining peer

#### Scenario: Empty signal payload is rejected
- **WHEN** a registered peer sends a `signal` message with an empty payload object
- **THEN** the relay rejects the message before forwarding it

#### Scenario: Oversized signal payload is rejected
- **WHEN** a registered peer sends a `signal` message whose serialized payload exceeds the protocol payload size bound
- **THEN** the relay rejects the message before forwarding it

#### Scenario: Sensitive signal payload keys are rejected
- **WHEN** a registered peer sends a `signal` message whose payload contains a token, credential, pairing code, API key, authorization header, auth header, cookie, private key, keystroke, screenshot, screen data, screen content, clipboard content, file-transfer content/data/bytes, diagnostics content/dump, or secret key at any nesting level
- **THEN** the relay rejects the message before forwarding it and MUST NOT treat the payload as trusted remote-assistance data
