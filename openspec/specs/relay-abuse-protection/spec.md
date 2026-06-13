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

### Requirement: Transport-independent rejection accounting
The relay SHALL record invalid-message audit events and apply invalid-message rate-limit accounting for rejected messages even when the sender WebSocket is already closing or cannot accept a peer-facing `relay-error` response. Failed `relay-error` delivery MUST NOT forward the rejected message, grant permissions, start capture, send input, suppress host visibility, bypass consent workflows, or suppress required rejection audit and rate-limit accounting.

#### Scenario: Rejection accounting survives closed sender transport
- **WHEN** a relay message is rejected while the sender WebSocket is no longer open for sending a `relay-error`
- **THEN** the relay records the secret-safe rejection audit event and applies invalid-message rate-limit accounting
- **AND** the rejected message is not forwarded to another peer

#### Scenario: Relay-error send failure remains non-authorizing
- **WHEN** a relay-owned `relay-error` response cannot be delivered because the sender transport is closing
- **THEN** that delivery failure MUST NOT approve sessions, grant permissions, start capture, send input, reconnect peers, suppress host visibility, or bypass consent workflows

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
The relay SHALL expose simple environment configuration for development rate-limit windows and limits while documenting that production needs distributed abuse protection. Configured rate-limit limit and window values SHALL be canonical positive decimal integers with no leading zeros. Configured rate-limit limits MUST be from `1` through `1_000_000`. Configured rate-limit windows MUST be from `1000` through `2_147_483_647` milliseconds. Direct rate-limiter options accepted by the relay SHALL be copied into a validated immutable snapshot before use so caller mutations after construction cannot change enforcement or audit decision metadata.

#### Scenario: Rate limit environment is omitted
- **WHEN** no rate-limit environment variables are set
- **THEN** the relay uses safe development defaults

#### Scenario: Rate limit environment is canonical
- **WHEN** a rate-limit limit environment variable is set to a canonical positive decimal integer from `1` through `1_000_000`
- **AND** a rate-limit window environment variable is set to a canonical positive decimal integer from `1000` through `2_147_483_647`
- **THEN** the relay uses those configured values for the development limiter

#### Scenario: Malformed rate limit environment is rejected
- **WHEN** a rate-limit limit or window environment variable is empty, partial, fractional, negative, zero where a positive value is required, below the minimum window, above the safe development bound, or contains leading zeros
- **THEN** the relay rejects the configuration before using the limiter

#### Scenario: Direct limiter options are snapshotted
- **WHEN** caller code constructs a rate limiter with safe direct options and later mutates that original options object
- **THEN** later rate-limit decisions use the validated limit and window captured during construction
- **AND** the later mutation MUST NOT weaken rate limiting, change decision metadata, approve sessions, grant permissions, start capture, send input, suppress host visibility, or bypass consent workflows
