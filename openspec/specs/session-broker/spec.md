# session-broker Specification

## Purpose
Defines the development relay session broker contract for pairing-gated joins, two-party rooms, protocol validation, signaling safety, and disconnect notices.
## Requirements
### Requirement: Pairing-based session join
The system SHALL require peers to join a brokered session using an explicit session id, role, peer id, and pairing credential before relay messages are accepted.

#### Scenario: Peer joins with required fields
- **WHEN** a peer connects to the relay with a valid session id, role, peer id, and pairing credential
- **THEN** the relay registers the peer in that session and returns a relay-ready message

#### Scenario: Peer omits required fields
- **WHEN** a peer connects without required join fields
- **THEN** the relay rejects the connection before forwarding any peer message

### Requirement: Two-party relay room
The relay SHALL limit each development session room to one host peer and one viewer peer unless a future OpenSpec change introduces multi-viewer semantics.

#### Scenario: Third peer attempts to join
- **WHEN** a session room already contains a host and a viewer
- **THEN** the relay rejects additional peers for that room

#### Scenario: Second host attempts to join
- **WHEN** a session room already contains a live host and another socket attempts to join the same session as a host with a different `peerId`
- **THEN** the relay rejects the second host before registration
- **AND** the original host remains the registered host

#### Scenario: Second viewer attempts to join
- **WHEN** a session room already contains a live viewer and another socket attempts to join the same session as a viewer with a different `peerId`
- **THEN** the relay rejects the second viewer before registration
- **AND** the original viewer remains the registered viewer

### Requirement: Live peer identity exclusivity
The relay SHALL reject a join attempt before registration when the target session already has a live registered peer with the same `peerId`, and SHALL NOT replace the existing peer connection or treat the duplicate join as an authorized reconnect.

#### Scenario: Duplicate live peer id is rejected
- **WHEN** a peer is already registered in a relay session and another socket attempts to join the same session with the same `peerId`
- **THEN** the relay rejects the duplicate join before registration
- **AND** the original peer remains the registered peer for that `peerId`

#### Scenario: Duplicate live peer rejection is secret-safe
- **WHEN** the relay rejects a duplicate live peer join
- **THEN** the peer-facing relay error and audit reason MUST use bounded metadata-only text and MUST NOT include raw pairing codes, tokens, credentials, protocol payloads, private reasons, keystrokes, screenshots, screen contents, or full secrets

#### Scenario: Peer id can rejoin after disconnect cleanup
- **WHEN** a registered peer disconnects and the relay removes it from room membership
- **THEN** a later join using the same `peerId` MAY be accepted through the normal pairing and room constraints

### Requirement: Message schema validation
The relay and agents SHALL validate protocol envelopes before accepting or forwarding messages, protocol display-name metadata SHALL be non-blank and already trimmed, `hello` capability metadata SHALL be non-blank, already trimmed, and unique after trimming, and relay rejection errors for malformed protocol input SHALL use bounded secret-safe reasons.

#### Scenario: Invalid protocol message
- **WHEN** a peer sends malformed JSON or an unknown protocol message
- **THEN** the receiver rejects the message and emits an audit/error event without forwarding it as trusted data

#### Scenario: Blank hello display name
- **WHEN** a peer sends a `hello` protocol message with an empty or whitespace-only display name
- **THEN** the receiver rejects the message before accepting or forwarding it as trusted peer metadata

#### Scenario: Untrimmed hello display name
- **WHEN** a peer sends a `hello` protocol message whose `displayName` has leading or trailing whitespace
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

#### Scenario: Display-name rejection remains secret-safe
- **WHEN** the relay rejects protocol input because display-name metadata is untrimmed
- **THEN** the peer-facing relay error and audit reason MUST NOT include raw display names, raw protocol payloads, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, or full secrets

### Requirement: Signal payload safety
The relay and agents SHALL reject `signal` protocol messages whose payload omits a top-level string `authorizationId`, carries a malformed payload `authorizationId`, is empty, exceeds the configured protocol payload size bound, or contains keys that indicate raw tokens, credentials, pairing codes, API keys, authorization headers, auth headers, cookies, private keys, keystrokes, keylogging content, screenshots, screen data, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or secrets. Non-secret lifecycle identifiers such as `authorizationId` MUST remain permitted.

#### Scenario: Small signaling payload is accepted
- **WHEN** a registered peer sends a `signal` message containing a non-empty small signaling payload with a valid top-level `authorizationId` and without sensitive key names
- **THEN** the relay accepts the message as schema-valid and may forward it to the remaining peer

#### Scenario: Lifecycle authorization identifier is accepted
- **WHEN** a registered peer sends a `signal` message containing `authorizationId` as a non-secret lifecycle identifier and no sensitive key names
- **THEN** the relay accepts the message as schema-valid and may forward it to the remaining peer

#### Scenario: Missing signal authorization identifier is rejected
- **WHEN** a registered peer sends a `signal` message whose payload omits top-level `authorizationId`
- **THEN** the relay rejects the message before forwarding it

#### Scenario: Malformed signal authorization identifier is rejected
- **WHEN** a registered peer sends a `signal` message whose payload `authorizationId` is not a valid protocol identifier string
- **THEN** the relay rejects the message before forwarding it

#### Scenario: Empty signal payload is rejected
- **WHEN** a registered peer sends a `signal` message with an empty payload object
- **THEN** the relay rejects the message before forwarding it

#### Scenario: Oversized signal payload is rejected
- **WHEN** a registered peer sends a `signal` message whose serialized payload exceeds the protocol payload size bound
- **THEN** the relay rejects the message before forwarding it

#### Scenario: Sensitive signal payload keys are rejected
- **WHEN** a registered peer sends a `signal` message whose payload contains a token, credential, pairing code, API key, authorization header, auth header, cookie, private key, keystroke, screenshot, screen data, screen content, clipboard content, file-transfer content/data/bytes, diagnostics content/dump, or secret key at any nesting level
- **THEN** the relay rejects the message before forwarding it and MUST NOT treat the payload as trusted remote-assistance data

#### Scenario: Keylogging signal payload keys are rejected
- **WHEN** a registered peer sends a `signal` message whose payload contains keylogging-related field names such as `keylog`, `rawKeylog`, `keylogger`, or `keyloggerOutput` at any nesting level
- **THEN** the relay rejects the message before forwarding it and MUST NOT treat the payload as trusted remote-assistance data

### Requirement: Signal payload JSON compatibility
The relay and agents SHALL accept only JSON-compatible object values in `signal.payload` before parsing, encoding, forwarding, sending, receiving, or treating the payload as trusted remote-assistance signaling metadata. `signal.payload` MUST reject values that cannot be represented faithfully in JSON, including functions, symbols, bigint, `undefined`, `NaN`, `Infinity`, `-Infinity`, cyclic values, own symbol-keyed properties, own non-enumerable properties, accessor properties, sparse arrays, non-index array properties, and inherited `toJSON` hooks that would change encoded output.

#### Scenario: JSON-compatible signal payload is accepted
- **WHEN** a peer sends a `signal` message whose payload contains strings, finite numbers, booleans, null, arrays, and nested plain objects with a valid top-level `authorizationId`
- **THEN** the protocol schema accepts the payload if all other signal safety checks pass

#### Scenario: Non-JSON signal payload is rejected
- **WHEN** a peer sends a `signal` message whose payload contains a function, symbol, bigint, `undefined`, `NaN`, `Infinity`, `-Infinity`, cyclic value, own symbol-keyed property, own non-enumerable property, accessor property, sparse array, non-index array property, or inherited `toJSON` hook that would change encoded output
- **THEN** the protocol schema rejects the message before forwarding, encoding, sending, receiving, or treating the payload as trusted remote-assistance signaling metadata

#### Scenario: Existing signal safety checks remain enforced
- **WHEN** a `signal` payload is JSON-compatible but omits a valid top-level `authorizationId`, is empty, oversized, or contains sensitive remote-assistance content keys
- **THEN** the relay and agents continue to reject the signal before forwarding or treating it as trusted remote-assistance data

### Requirement: Canonical signal payload size measurement
The relay and agents SHALL enforce the `signal.payload` size bound using the shared canonical JSON byte length, and inherited `toJSON` hooks or prototype pollution MUST NOT reduce or alter the measured payload size.

#### Scenario: Oversized signal payload measurement ignores inherited toJSON hooks
- **WHEN** a peer submits a `signal` payload whose canonical JSON byte length exceeds the protocol payload size bound while an inherited `toJSON` hook is present
- **THEN** the protocol schema rejects the signal as oversized before forwarding, encoding, sending, receiving, or treating it as trusted remote-assistance signaling metadata

#### Scenario: Small signal payload measurement remains stable
- **WHEN** a peer submits a schema-valid small `signal` payload whose canonical JSON byte length is within the protocol payload size bound
- **THEN** the protocol schema accepts the payload if all other signal safety checks pass

### Requirement: Development relay token
The relay SHALL support an optional shared token for local/private development and SHALL document that production deployments require stronger identity and authorization. When a shared token is configured, it MUST be non-blank, already trimmed, 1024 UTF-8 bytes or less, contain no ASCII control characters, and peers MUST present exactly one `token` query parameter whose value exactly matches the configured shared token before joining a session room. When a shared token is not configured, peers MUST NOT present any `token` query parameter and the relay MUST reject token-bearing connections before joining a session room.

#### Scenario: Shared token configured
- **WHEN** the relay is started with a shared token
- **THEN** peers without exactly one matching token are rejected before joining a session room

#### Scenario: Duplicate shared token query is rejected
- **WHEN** the relay is started with a shared token and a peer connects with more than one `token` query parameter
- **THEN** the peer is rejected before joining a session room

#### Scenario: Padded shared token query is rejected
- **WHEN** the relay is started with a trimmed shared token and a peer connects with a token query value containing leading or trailing whitespace
- **THEN** the peer is rejected before joining a session room because exact token comparison fails
- **AND** the relay MUST NOT store, forward, echo, log, or audit the raw configured token or raw presented token value

#### Scenario: Shared token omitted
- **WHEN** the relay is started without a shared token
- **THEN** the relay starts in development mode and logs a warning that it is not production authorization

#### Scenario: Token query rejected when shared token omitted
- **WHEN** the relay is started without a shared token and a peer connects with one or more `token` query parameters
- **THEN** the peer is rejected before joining a session room
- **AND** the relay MUST NOT store, forward, echo, or audit the raw presented token value

#### Scenario: Malformed shared token is rejected
- **WHEN** the relay is configured with an empty, whitespace-only, non-string, untrimmed, control-character, or oversized shared token
- **THEN** the relay rejects the configuration before accepting peer connections

### Requirement: Host-created pairing gate
The relay SHALL require a host-created pairing ticket before registering a viewer in a brokered development session.

#### Scenario: Viewer joins before host
- **WHEN** a viewer attempts to join a relay session before the host has created pairing material
- **THEN** the relay rejects the viewer before registration and does not create a viewer-originated pairing ticket

#### Scenario: Viewer joins after host with valid pairing
- **WHEN** a host has joined and a viewer presents the matching unexpired pairing credential
- **THEN** the relay registers the viewer and returns a relay-ready message

#### Scenario: Invalid pairing fails before forwarding
- **WHEN** a viewer presents missing, mismatched, expired, or consumed pairing material
- **THEN** the relay rejects the join before forwarding any peer message from that viewer

### Requirement: Peer disconnect notification
The relay SHALL send a schema-valid peer disconnect notification to remaining peers in a brokered two-party session when a registered peer disconnects.

#### Scenario: Host disconnects from a paired session
- **WHEN** a registered host disconnects from a relay room that still contains a viewer
- **THEN** the relay sends the viewer a `peer-disconnected` protocol message identifying the host peer id, host role, session id, and a bounded reason code

#### Scenario: Viewer disconnects from a paired session
- **WHEN** a registered viewer disconnects from a relay room that still contains a host
- **THEN** the relay sends the host a `peer-disconnected` protocol message identifying the viewer peer id, viewer role, session id, and a bounded reason code

#### Scenario: Disconnect notification does not grant remote action
- **WHEN** a peer receives a `peer-disconnected` protocol message
- **THEN** the message MUST NOT grant permissions, start capture, send input, reconnect the peer, bypass authorization, or override host consent state

#### Scenario: No remaining peer
- **WHEN** a registered peer disconnects from a room with no other registered peer
- **THEN** the relay records the disconnect without sending a peer disconnect notification

#### Scenario: Secret-safe disconnect reason
- **WHEN** the relay sends a peer disconnect notification
- **THEN** the notification MUST contain only a bounded reason code and MUST NOT include raw close reasons, pairing codes, tokens, protocol payloads, keystrokes, screenshots, or screen contents

### Requirement: Relay-originated disconnect notice authority
The relay SHALL treat `peer-disconnected` as a relay-originated lifecycle notice and MUST reject peer-originated `peer-disconnected` messages before forwarding.

#### Scenario: Peer attempts forged disconnect notice
- **WHEN** a registered peer sends a `peer-disconnected` message as an ordinary peer message
- **THEN** the relay rejects the message before forwarding it to the remaining peer

#### Scenario: Relay sends broker-observed disconnect notice
- **WHEN** the relay observes a registered peer disconnect through the transport close path
- **THEN** the relay may send a `peer-disconnected` notice to remaining peers using safe bounded disconnect metadata

#### Scenario: Forged notice does not change remote lifecycle state
- **WHEN** the relay rejects a peer-originated `peer-disconnected` message
- **THEN** the remaining peer MUST NOT receive that forged notice and MUST NOT change session lifecycle state because of it

### Requirement: Registered peer message authority
The relay SHALL reject registered-peer messages before forwarding when the message is join-only, relay-originated, declares a sender or actor peer id different from the registered peer, uses a role-bound authorization field that does not match the registered peer role, sends a legacy host consent decision from a non-host peer, or uses host-only workflow authority from a non-host peer.

#### Scenario: Registered peer replays join message
- **WHEN** a registered peer sends a `join-session` message as an ordinary peer message
- **THEN** the relay rejects the message before forwarding it and MUST NOT expose the pairing credential to the remaining peer

#### Scenario: Peer forges relay-only message
- **WHEN** a registered peer sends a `relay-ready` or `peer-disconnected` message as an ordinary peer message
- **THEN** the relay rejects the message before forwarding it to the remaining peer

#### Scenario: Peer spoofs another sender
- **WHEN** a registered peer sends a peer-originated message whose sender or actor peer id identifies a different peer
- **THEN** the relay rejects the message before forwarding it and MUST NOT treat it as trusted remote-assistance data

#### Scenario: Peer sends role-mismatched authorization message
- **WHEN** a registered host sends a viewer-originated authorization request or a registered viewer sends a host-originated authorization decision
- **THEN** the relay rejects the message before forwarding it

#### Scenario: Viewer sends legacy host consent decision
- **WHEN** a registered viewer sends a legacy `host-consent-decision` as an ordinary peer message
- **THEN** the relay rejects the message before forwarding it
- **AND** the remaining host MUST NOT receive that legacy host consent decision

#### Scenario: Viewer sends host-only workflow authority message
- **WHEN** a registered viewer sends `session-authorization-state`, `permission-revoked`, `session-control`, or `audit-event` as an ordinary peer message
- **THEN** the relay rejects the message before forwarding it
- **AND** the remaining host MUST NOT receive that host-only workflow authority message

#### Scenario: Registered peer authority rejection is secret-safe
- **WHEN** the relay rejects a registered-peer message authority violation
- **THEN** the peer-facing relay error and audit reason MUST use bounded metadata-only text and MUST NOT include raw pairing codes, tokens, credentials, protocol payloads, private reasons, keystrokes, screenshots, screen contents, or full secrets

### Requirement: Registered recipient targeting
The relay SHALL reject registered-peer messages before forwarding when no remaining registered recipient is available or when an explicit target peer id does not match the remaining recipient in the two-party room.

#### Scenario: Registered peer sends with no recipient
- **WHEN** a registered peer sends an ordinary peer message before the other peer has joined or after the other peer has left
- **THEN** the relay rejects the message before forwarding and MUST NOT record it as an accepted remote-assistance delivery

#### Scenario: Signal targets wrong peer
- **WHEN** a registered peer sends a `signal` message with `toPeerId` set to itself, an unknown peer, or any peer other than the remaining registered recipient
- **THEN** the relay rejects the message before forwarding it

#### Scenario: Host decision targets wrong viewer
- **WHEN** a registered host sends a host consent or session authorization decision whose `viewerPeerId` does not identify the remaining registered viewer
- **THEN** the relay rejects the message before forwarding it

#### Scenario: Recipient targeting rejection is secret-safe
- **WHEN** the relay rejects a message for missing recipient or target mismatch
- **THEN** the peer-facing relay error and audit reason MUST use bounded metadata-only text and MUST NOT include raw pairing codes, tokens, credentials, protocol payloads, private reasons, keystrokes, screenshots, screen contents, or full secrets
