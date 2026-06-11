# relay-abuse-protection Specification

## Purpose
Defines development relay abuse controls for invalid access attempts, malformed messages, oversized messages, and secret-safe rejection metadata.
## Requirements
### Requirement: Invalid token rate limiting
The relay SHALL rate-limit repeated invalid shared-token attempts before a peer joins a session.

#### Scenario: Invalid token attempts exceed limit
- **WHEN** a remote address exceeds the configured invalid token attempt limit
- **THEN** the relay closes the connection and emits an audit event with denied outcome and rate-limited metadata

### Requirement: Invalid message rate limiting
The relay SHALL rate-limit repeated malformed or rejected protocol messages from the same registered peer or remote address.

#### Scenario: Malformed messages exceed limit
- **WHEN** a peer repeatedly sends malformed or rejected protocol messages beyond the configured limit
- **THEN** the relay closes the connection and emits an audit event with failed outcome and rate-limited metadata

### Requirement: Raw relay message size limit
The relay SHALL reject inbound WebSocket messages whose raw byte length exceeds the relay message size bound at the WebSocket transport cap or before decoding JSON and validating protocol envelopes.

#### Scenario: Oversized relay message is rejected
- **WHEN** a peer sends a WebSocket message larger than the relay message size bound
- **THEN** the relay rejects the message before forwarding it or decoding it as trusted protocol data

#### Scenario: Oversized relay message counts as invalid
- **WHEN** the relay rejects an oversized WebSocket message
- **THEN** the relay records the rejection through the invalid-message path and applies invalid-message rate-limit accounting

#### Scenario: Transport cap rejects oversized relay message
- **WHEN** the WebSocket transport rejects an oversized message before delivering it to the relay message handler
- **THEN** the relay records a secret-safe invalid-message rejection and the sender connection is closed without forwarding the message

#### Scenario: Oversized relay message audit is secret-safe
- **WHEN** the relay audits an oversized WebSocket message rejection
- **THEN** the audit record MUST NOT include raw message bytes, raw tokens, raw pairing codes, credentials, protocol payloads, keystrokes, screenshots, screen contents, or full secrets

### Requirement: Secret-safe rate-limit audit details
The relay MUST NOT include raw tokens, raw pairing codes, credentials, or protocol payload secrets in rate-limit audit details.

#### Scenario: Rate limit audit is emitted
- **WHEN** the relay audits an invalid token, join failure, or malformed message
- **THEN** the audit detail includes only safe metadata such as remaining attempts, reset time, registered state, and booleans

### Requirement: Secret-safe relay rejection reasons
The relay SHALL normalize peer-facing relay errors and invalid-message audit reasons to bounded secret-safe strings.

#### Scenario: Malformed message reason is generic
- **WHEN** a peer sends malformed JSON or schema-invalid protocol input
- **THEN** the relay returns a bounded generic rejection reason and MUST NOT include raw parser details or raw message contents

#### Scenario: Known policy rejection reason is preserved
- **WHEN** the relay rejects a message for a known safe policy reason such as session mismatch, forged disconnect notice, unsafe signal payload, or oversized message
- **THEN** the relay may return that bounded policy reason without raw payload contents

#### Scenario: Invalid-message audit reason is secret-safe
- **WHEN** the relay audits a malformed or rejected protocol message
- **THEN** the audit reason MUST NOT include raw protocol payloads, raw tokens, raw pairing codes, credentials, keystrokes, screenshots, screen contents, parser internals, or full secrets

### Requirement: Development-only limiter configuration
The relay SHALL expose simple environment configuration for development rate-limit windows and limits while documenting that production needs distributed abuse protection.

#### Scenario: Rate limit environment is omitted
- **WHEN** no rate-limit environment variables are set
- **THEN** the relay uses safe development defaults
