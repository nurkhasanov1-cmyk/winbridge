# relay-runtime Specification

## Purpose
Defines the managed development relay lifecycle, shared CLI/test runtime behavior, and test hooks for security-relevant relay events.
## Requirements
### Requirement: Managed relay lifecycle
The development relay SHALL expose a managed runtime with explicit start and stop operations. The managed runtime SHALL reject malformed injected port configuration before creating a listener or opening a listening socket.

#### Scenario: Runtime starts on ephemeral port
- **WHEN** tests start the relay runtime with port `0`
- **THEN** the runtime listens on an available local port and reports its WebSocket URL

#### Scenario: Runtime stops
- **WHEN** tests stop the relay runtime
- **THEN** the WebSocket server and HTTP server are closed

#### Scenario: Runtime rejects malformed port configuration
- **WHEN** the relay is configured with a malformed, negative, fractional, non-finite, or out-of-range injected port value
- **THEN** it rejects the configuration before creating a listener, opening a listening socket, or accepting peer connections

### Requirement: Shared CLI and test implementation
The relay CLI and integration tests SHALL use the same runtime implementation.

#### Scenario: CLI starts relay
- **WHEN** the relay CLI is executed
- **THEN** it starts the managed relay runtime with environment-derived configuration

### Requirement: Relay CLI unexpected errors are secret-safe
The relay CLI SHALL report unexpected startup and shutdown failures without exposing raw exception messages, stack traces, local file paths, shared tokens, pairing codes, credentials, protocol payload fragments, keystrokes, screenshots, screen contents, or input contents.

#### Scenario: Startup failure output is metadata-only
- **WHEN** the relay CLI reports an unexpected startup failure
- **THEN** stderr output MUST include a generic relay error diagnostic with summary metadata such as raw message byte length
- **AND** stderr output MUST NOT include the raw exception message or stack trace

#### Scenario: Shutdown failure output is metadata-only
- **WHEN** the relay CLI reports an unexpected shutdown failure
- **THEN** stderr output MUST include a generic relay error diagnostic with summary metadata such as raw message byte length
- **AND** stderr output MUST NOT include the raw exception message or stack trace

### Requirement: End-to-end broker verification
The relay runtime SHALL be verifiable through WebSocket integration tests for accepted joins, message forwarding, rejected joins, invalid tokens, and rate-limit closure.

#### Scenario: Host and viewer exchange messages
- **WHEN** a host and viewer join the same session with matching pairing credentials
- **THEN** the relay returns readiness to both peers and forwards protocol messages between them

#### Scenario: Viewer uses wrong pairing credential
- **WHEN** a viewer joins a host session with a mismatched pairing credential
- **THEN** the relay rejects the join and does not register the viewer as authorized in the room

### Requirement: Unsafe signal rejection verification
The relay runtime SHALL expose tests proving unsafe `signal` payloads are rejected before forwarding and that rejection audit metadata remains secret-safe.

#### Scenario: Relay rejects unsafe signal payload
- **WHEN** a registered peer sends a schema-invalid `signal` message because its payload omits a valid top-level authorization id, is empty, oversized, or contains sensitive key names including raw tokens, pairing codes, API keys, authorization headers, auth headers, cookies, private keys, access keys, SSH keys, keylogging content, clipboard contents, file-transfer contents/data/bytes, or diagnostics content/dumps
- **THEN** the relay returns a relay error to the sender and does not deliver the message to the remaining peer

#### Scenario: Unsafe signal rejection audit is secret-safe
- **WHEN** the relay records an unsafe `signal` rejection
- **THEN** the audit record identifies the rejection without raw tokens, raw pairing codes, credentials, API keys, authorization headers, auth headers, cookies, private keys, raw access keys, raw SSH keys, keylogging payload contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, raw protocol payloads, keystrokes, screenshots, screen contents, or full secrets

#### Scenario: Relay rejects access-key and SSH-key signal payload
- **WHEN** a registered peer sends a `signal` message whose payload contains access-key or SSH-key field names such as `accessKey`, `access_key`, `access-key`, `sshKey`, or `ssh_key` at any nesting level
- **THEN** the relay returns a bounded relay error to the sender, does not deliver the signal to the remaining peer, and records only secret-safe rejection metadata

#### Scenario: Relay rejects keylogging signal payload
- **WHEN** a registered peer sends a `signal` message whose payload includes keylogging-related field names such as `keylog`, `rawKeylog`, `keylogger`, or `keyloggerOutput`
- **THEN** the relay returns a bounded relay error to the sender, does not deliver the signal to the remaining peer, and records only secret-safe rejection metadata

### Requirement: Testable non-JSON signal payload rejection
The relay runtime SHALL expose integration-test coverage proving non-JSON `signal` payloads are rejected before forwarding and that rejection metadata remains secret-safe.

#### Scenario: Relay rejects non-JSON signal payload
- **WHEN** integration tests register a host and viewer, then one peer sends a `signal` message whose payload contains a non-JSON value or property shape
- **THEN** the relay returns a bounded relay error to the sender and the remaining peer receives no forwarded `signal` message

#### Scenario: Non-JSON signal rejection audit is secret-safe
- **WHEN** the relay audits a rejected non-JSON `signal` payload
- **THEN** the audit record identifies the rejection without raw signal payload contents, raw tokens, raw pairing codes, credentials, private reasons, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets

### Requirement: Testable relay message size limit
The relay runtime SHALL expose integration-test coverage proving oversized inbound messages are rejected before forwarding.

#### Scenario: Runtime rejects oversized registered peer message
- **WHEN** integration tests register a host and viewer, then one peer sends a WebSocket message larger than the relay message size bound
- **THEN** the sender receives a relay error or the sender connection closes, and the remaining peer does not receive the oversized message as a protocol envelope

### Requirement: Testable bounded relay rejection reasons
The relay runtime SHALL expose integration-test coverage proving malformed peer messages receive bounded secret-safe relay error and audit reasons.

#### Scenario: Runtime rejects malformed protocol with bounded reason
- **WHEN** integration tests send malformed protocol input to a registered peer connection
- **THEN** the sender receives a bounded relay error reason and the remaining peer receives no forwarded protocol message

#### Scenario: Runtime audit omits malformed payload details
- **WHEN** the relay audits the malformed protocol rejection
- **THEN** the audit reason and detail do not contain the raw malformed message contents

### Requirement: Relay rejects unknown fixed protocol fields
The relay runtime SHALL reject inbound protocol messages with unknown fixed-shape fields before peer registration, room mutation, or forwarding.

#### Scenario: Join message has unknown fixed field
- **WHEN** an unregistered peer sends a `join-session` message with an unknown top-level field
- **THEN** the relay rejects the message before registering the peer, creating pairing material, consuming pairing material, or forwarding any peer message

#### Scenario: Registered message has unknown fixed field
- **WHEN** a registered peer sends a protocol message with an unknown top-level field outside allowed metadata containers
- **THEN** the relay returns a bounded relay error to the sender and does not deliver the message to the remaining peer

#### Scenario: Unknown fixed field rejection audit is secret-safe
- **WHEN** the relay audits a protocol rejection caused by an unknown fixed field
- **THEN** the audit record identifies the rejection without raw unknown field values, raw protocol payloads, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, or full secrets

### Requirement: Canonical relay-error encoding
The relay runtime SHALL encode relay-owned `relay-error` responses through canonical JSON serialization that is not affected by inherited `toJSON` hooks or prototype pollution.

#### Scenario: Relay-error encoding ignores inherited toJSON hooks
- **WHEN** a registered peer sends malformed protocol input while an inherited `Object.prototype.toJSON` hook is present in the relay process
- **THEN** the sender receives a `relay-error` response with only the bounded reason fields
- **AND** the response body MUST NOT include fields injected by inherited `toJSON` hooks
- **AND** the remaining peer receives no forwarded protocol message

#### Scenario: Relay-error rejection audit remains secret-safe
- **WHEN** the relay emits a `relay-error` response for malformed registered peer input
- **THEN** the relay audit record remains bounded and secret-safe without raw malformed payload contents or fields injected by inherited `toJSON` hooks

### Requirement: Testable audit behavior
The relay runtime SHALL allow tests to inject audit sinks and inspect security-relevant runtime events.

#### Scenario: Runtime rejects invalid token
- **WHEN** a peer connects with a missing, invalid, or duplicated shared token
- **THEN** the injected audit sink receives a secret-safe denied token event
- **AND** the peer-facing close reason MUST be bounded and MUST NOT include the raw presented token, configured shared token, credentials, pairing codes, protocol payloads, private reasons, keystrokes, screenshots, or screen contents

#### Scenario: Runtime rejects token query without configured token
- **WHEN** the relay runtime has no configured shared token and a peer connects with one or more `token` query parameters
- **THEN** the injected audit sink receives a secret-safe denied token event before peer registration
- **AND** the peer-facing close reason MUST be bounded and MUST NOT include the raw presented token, credentials, pairing codes, protocol payloads, private reasons, keystrokes, screenshots, or screen contents

### Requirement: Testable shared-token configuration
The managed relay runtime SHALL reject malformed development shared-token configuration before creating a listener, opening a listening socket, or accepting peer connections. Malformed shared-token configuration MUST include non-string, blank, whitespace-only, untrimmed, ASCII-control-character, Unicode bidirectional-formatting-control, zero-width-formatting-control, or oversized values.

#### Scenario: Runtime shared token configuration is malformed
- **WHEN** tests create the relay runtime with non-string, blank, untrimmed, ASCII-control-character, Unicode bidirectional-formatting-control, zero-width-formatting-control, or oversized shared-token configuration
- **THEN** the runtime rejects configuration before accepting peer connections

#### Scenario: Environment shared token configuration is malformed
- **WHEN** the relay shared-token environment value is blank, untrimmed, ASCII-control-character, Unicode bidirectional-formatting-control, zero-width-formatting-control, or oversized
- **THEN** relay shared-token config parsing rejects the value before accepting peer connections

#### Scenario: Shared-token config rejection does not leak secrets
- **WHEN** relay shared-token configuration is rejected
- **THEN** thrown errors, startup diagnostics, audit records, and logs MUST NOT expose the raw shared token, token whitespace shape, pairing codes, credentials, protocol payloads, keystrokes, screenshots, screen contents, or full secrets

### Requirement: Testable heartbeat configuration
The managed relay runtime SHALL allow callers to inject relay heartbeat settings or disable heartbeat timers for tests, and SHALL reject unsafe injected heartbeat timer values before starting peer heartbeat timers.

#### Scenario: Runtime receives injected heartbeat settings
- **WHEN** tests create a relay runtime with explicit heartbeat interval and timeout values
- **THEN** the runtime uses those values instead of environment-derived defaults

#### Scenario: Runtime disables heartbeat timers
- **WHEN** tests create a relay runtime with heartbeat disabled
- **THEN** the runtime accepts peers without starting per-peer heartbeat timers

#### Scenario: Runtime rejects unsafe injected heartbeat settings
- **WHEN** tests create the relay runtime with non-integer, non-positive, or timer-unsafe heartbeat interval or timeout values
- **THEN** the runtime rejects configuration before starting peer heartbeat timers

### Requirement: CLI heartbeat defaults
The relay CLI SHALL start the managed relay runtime with environment-derived heartbeat configuration.

#### Scenario: CLI starts without heartbeat variables
- **WHEN** the relay CLI starts without heartbeat environment variables
- **THEN** the runtime enables development heartbeat defaults

### Requirement: Development pairing ticket runtime configuration
The relay runtime SHALL allow development pairing ticket TTL and maximum-use settings to be configured for tests and local execution, and SHALL reject malformed or unsafe environment-derived or injected pairing ticket configuration before opening a listener, accepting peer connections, or creating pairing tickets.

#### Scenario: Runtime uses injected pairing settings
- **WHEN** tests create the relay runtime with explicit pairing ticket TTL and maximum-use settings
- **THEN** the runtime uses those settings for host-created relay pairing tickets

#### Scenario: CLI uses environment pairing settings
- **WHEN** the relay CLI starts with pairing ticket environment variables
- **THEN** the runtime uses those values for development pairing tickets

#### Scenario: CLI omits pairing ticket environment
- **WHEN** the relay CLI starts without pairing ticket environment variables
- **THEN** the runtime uses development pairing ticket defaults

#### Scenario: Malformed pairing ticket environment is rejected
- **WHEN** the relay is configured with empty, partial, fractional, negative, or out-of-range pairing ticket TTL or maximum-use environment values
- **THEN** the relay rejects configuration before opening a listener or accepting peer connections

#### Scenario: Unsafe injected pairing settings are rejected
- **WHEN** tests create the relay runtime or room registry with non-number, non-finite, non-integer, negative, null, zero-use, or out-of-range pairing ticket settings
- **THEN** the runtime rejects configuration before creating host pairing tickets

### Requirement: Pairing lifecycle audit safety
The relay runtime SHALL emit secret-safe audit events for pairing ticket creation, consumption, and denied pairing joins.

#### Scenario: Pairing join is accepted
- **WHEN** a viewer consumes a valid relay pairing ticket
- **THEN** the relay audit details include safe metadata such as role, room size, ticket consumption status, and remaining use count without raw pairing codes

#### Scenario: Pairing join is denied
- **WHEN** a viewer join is rejected because pairing material is missing, mismatched, expired, or consumed
- **THEN** the relay audit details include safe reason metadata without raw pairing codes, credentials, tokens, protocol payloads, keystrokes, screenshots, or screen contents

### Requirement: Max-length peer audit reliability
The relay runtime SHALL write schema-valid audit records for accepted joins and peer events even when the registered peer id is at the maximum valid protocol identifier length.

#### Scenario: Max-length peer join audit is accepted
- **WHEN** a peer joins the relay with a valid max-length peer id
- **THEN** the relay emits `relay.peer.join.accepted` without audit schema failure

#### Scenario: Max-length peer audit omits pairing material
- **WHEN** the relay records audit metadata for a max-length peer id join
- **THEN** the audit record MUST NOT include raw pairing codes, tokens, credentials, protocol payloads, keystrokes, screenshots, screen contents, or full secrets

### Requirement: Testable duplicate peer join rejection
The relay runtime SHALL expose integration-test coverage proving duplicate live peer-id joins are rejected before registration or pairing mutation, while the original peer remains active.

#### Scenario: Runtime rejects duplicate host peer join
- **WHEN** integration tests register a host and a second socket attempts to join the same session with the same host peer id
- **THEN** the duplicate socket receives a bounded relay error
- **AND** the original host remains registered without having its pairing ticket refreshed

#### Scenario: Runtime rejects duplicate viewer peer join
- **WHEN** integration tests register a host and viewer and a second socket attempts to join the same session with the same viewer peer id
- **THEN** the duplicate socket receives a bounded relay error
- **AND** the original viewer remains registered

#### Scenario: Runtime duplicate peer rejection audit remains secret-safe
- **WHEN** the runtime audits a duplicate live peer-id join rejection
- **THEN** the audit record identifies the rejection without raw pairing codes, tokens, credentials, protocol payloads, private reasons, keystrokes, screenshots, screen contents, or full secrets

### Requirement: Testable same-role join rejection
The relay runtime SHALL expose integration-test coverage proving a second live host or second live viewer with a different `peerId` is rejected before registration with a bounded same-role denial reason, while the original same-role peer remains active.

#### Scenario: Runtime rejects second host role
- **WHEN** integration tests register a host and a second socket attempts to join the same session as another host with a different `peerId`
- **THEN** the second host socket receives a bounded same-role relay error
- **AND** the original host remains registered and can receive forwarded peer messages

#### Scenario: Runtime rejects second viewer role
- **WHEN** integration tests register a host and viewer and a second socket attempts to join the same session as another viewer with a different `peerId`
- **THEN** the second viewer socket receives a bounded same-role relay error
- **AND** the original viewer remains registered and can receive forwarded peer messages

#### Scenario: Runtime same-role rejection audit remains secret-safe
- **WHEN** the runtime audits a same-role join rejection
- **THEN** the audit record identifies the bounded same-role denial and role-conflict classification without raw pairing codes, tokens, credentials, protocol payloads, private reasons, keystrokes, screenshots, screen contents, or full secrets

### Requirement: Testable peer disconnect notification
The relay runtime SHALL expose peer disconnect notification behavior through integration tests and secret-safe audit metadata.

#### Scenario: Remaining viewer receives host disconnect notification
- **WHEN** integration tests register a host and viewer, then close the host socket
- **THEN** the viewer receives a schema-valid `peer-disconnected` protocol message for the host

#### Scenario: Remaining host receives viewer disconnect notification
- **WHEN** integration tests register a host and viewer, then close the viewer socket
- **THEN** the host receives a schema-valid `peer-disconnected` protocol message for the viewer

#### Scenario: Remaining peer receives heartbeat timeout reason
- **WHEN** integration tests register a host and viewer, then the relay terminates one peer because it missed heartbeat response
- **THEN** the remaining peer receives a schema-valid `peer-disconnected` protocol message with reason code `heartbeat-timeout`

#### Scenario: Disconnect audit includes notification metadata
- **WHEN** a registered peer disconnects
- **THEN** the relay audit record includes secret-safe metadata for the peer role, bounded reason code, notification target count, notification sent count, and notification failure count

#### Scenario: Heartbeat timeout disconnect audit is bounded
- **WHEN** the relay records disconnect cleanup after heartbeat timeout
- **THEN** the disconnect audit detail includes reason code `heartbeat-timeout` without raw close reasons, pairing codes, tokens, protocol payloads, keystrokes, screenshots, screen contents, or full secrets

#### Scenario: Disconnect audit omits sensitive material
- **WHEN** a registered peer disconnects after joining with pairing credentials
- **THEN** the relay disconnect audit record MUST NOT include raw pairing codes, shared tokens, raw close reasons, protocol payloads, keystrokes, screenshots, or screen contents

### Requirement: Testable forged disconnect rejection
The relay runtime SHALL be verifiable through integration tests for rejecting peer-originated disconnect notices.

#### Scenario: Forged disconnect notice is rejected
- **WHEN** integration tests register a host and viewer, then one peer sends `peer-disconnected` as a normal message
- **THEN** the relay returns a relay error to the sender and does not deliver the forged notice to the other peer

#### Scenario: Forged disconnect rejection audit is secret-safe
- **WHEN** a peer-originated disconnect notice is rejected
- **THEN** the relay audit record identifies the rejected message type and reason without raw tokens, raw pairing codes, protocol payloads, keystrokes, screenshots, screen contents, or full secrets

### Requirement: Testable registered peer authority
The relay runtime SHALL expose integration-test coverage proving registered peers cannot forward join-only, relay-originated, spoofed sender/actor, role-mismatched authorization messages, legacy host consent decisions from a viewer peer, or host-only workflow authority messages from a viewer peer.

#### Scenario: Runtime rejects registered join replay
- **WHEN** integration tests register a host and viewer, then a registered peer sends another `join-session` message
- **THEN** the sender receives a bounded relay error and the remaining peer receives no forwarded `join-session` message

#### Scenario: Runtime rejects relay-only message forgery
- **WHEN** integration tests register a host and viewer, then a registered peer sends `relay-ready` or `peer-disconnected` as a normal message
- **THEN** the sender receives a bounded relay error and the remaining peer receives no forwarded relay-only message

#### Scenario: Runtime rejects sender spoofing
- **WHEN** integration tests register a host and viewer, then one peer sends a message declaring the other peer as its sender or actor
- **THEN** the sender receives a bounded relay error and the remaining peer receives no forwarded spoofed message

#### Scenario: Runtime rejects viewer host authorization decisions
- **WHEN** integration tests register a host and viewer, then the viewer sends a legacy `host-consent-decision` or `session-authorization-decision`
- **THEN** the sender receives a bounded relay error and the host receives no forwarded host authorization decision

#### Scenario: Runtime rejects viewer host-workflow messages
- **WHEN** integration tests register a host and viewer, then the viewer sends `session-authorization-state`, `permission-revoked`, `session-control`, or `audit-event`
- **THEN** the sender receives a bounded relay error and the host receives no forwarded host-workflow message

#### Scenario: Runtime rejection audit remains secret-safe
- **WHEN** the runtime audits a registered-peer message authority rejection
- **THEN** the audit record identifies the rejection without raw pairing codes, tokens, credentials, protocol payloads, private reasons, keystrokes, screenshots, screen contents, or full secrets

### Requirement: Testable registered recipient targeting
The relay runtime SHALL expose integration-test coverage proving registered-peer messages require a remaining recipient and explicit targets must match that recipient.

#### Scenario: Runtime rejects registered message without recipient
- **WHEN** integration tests register a host only, then the host sends an ordinary peer message
- **THEN** the sender receives a bounded relay error and no accepted forward audit record is emitted for that message

#### Scenario: Runtime rejects misaddressed signal target
- **WHEN** integration tests register a host and viewer, then one peer sends `signal` with `toPeerId` set to itself or an unknown peer
- **THEN** the sender receives a bounded relay error and the remaining peer receives no forwarded `signal` message

#### Scenario: Runtime rejects misaddressed authorization decision
- **WHEN** integration tests register a host and viewer, then the host sends an authorization decision addressed to a different viewer peer id
- **THEN** the sender receives a bounded relay error and the viewer receives no forwarded authorization decision

#### Scenario: Runtime recipient rejection audit remains secret-safe
- **WHEN** the runtime audits a missing-recipient or target-mismatch rejection
- **THEN** the audit record identifies the rejection without raw pairing codes, tokens, credentials, protocol payloads, private reasons, keystrokes, screenshots, screen contents, or full secrets

### Requirement: Forwarded signal authorization audit metadata
The relay runtime SHALL include the non-secret top-level signal `authorizationId` in accepted `relay.message.forwarded` audit detail when forwarding a schema-valid `signal` message, and MUST NOT include raw signal payload contents in that accepted forward audit record.

#### Scenario: Forwarded signal audit includes authorization identifier
- **WHEN** the relay forwards a schema-valid `signal` message with a valid top-level payload `authorizationId`
- **THEN** the accepted forward audit record detail includes `messageType` set to `signal` and `authorizationId` set to that identifier

#### Scenario: Forwarded signal audit omits raw payload contents
- **WHEN** the relay audits an accepted forwarded `signal` message
- **THEN** the audit record detail MUST NOT include raw SDP, ICE candidates, payload markers, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets

### Requirement: Testable forwarded hello audit metadata
The relay runtime SHALL expose integration-test coverage proving accepted `hello` forwarding audit records include safe message and recipient routing metadata and omit raw user display metadata.

#### Scenario: Forwarded hello audit includes routing metadata
- **WHEN** integration tests register a host and viewer, then one peer sends a schema-valid `hello` message
- **THEN** the remaining peer receives the forwarded `hello`
- **AND** the accepted forward audit record detail includes `messageType`, `messageId`, `recipientPeerId`, and `recipientRole`

#### Scenario: Forwarded hello audit omits presence metadata
- **WHEN** the relay audits an accepted forwarded `hello` message with display name and capability metadata
- **THEN** the audit record MUST NOT include raw display names, raw capability values, protocol payloads, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, or full secrets

### Requirement: Testable forwarded audit-event audit safety
The relay runtime SHALL expose integration-test coverage proving accepted `audit-event` forwarding audit records include safe message and recipient routing metadata and omit raw audit-event detail metadata.

#### Scenario: Forwarded audit-event reaches recipient with redacted detail
- **WHEN** integration tests register a host and viewer, then the host sends a schema-valid `audit-event` message with sensitive detail metadata
- **THEN** the viewer receives the forwarded `audit-event`
- **AND** sensitive `detail` values are redacted before the recipient observes the message

#### Scenario: Forwarded audit-event audit includes routing metadata
- **WHEN** the relay audits an accepted forwarded `audit-event` message
- **THEN** the accepted forward audit record detail includes `messageType`, `messageId`, `recipientPeerId`, and `recipientRole`
- **AND** the accepted forward audit record detail MUST NOT include raw audit-event detail fields

#### Scenario: Forwarded audit-event audit omits sensitive detail
- **WHEN** the relay audits an accepted forwarded `audit-event` message with private reason, display name, token, screen content, or payload marker metadata
- **THEN** the audit record MUST NOT include raw private reasons, display names, tokens, screen contents, protocol payloads, pairing codes, credentials, keystrokes, screenshots, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets

### Requirement: Forwarded message recipient audit metadata
The relay runtime SHALL include secret-safe recipient routing metadata in accepted `relay.message.forwarded` audit detail after selecting a concrete registered recipient, and MUST NOT include raw protocol payload contents or user display metadata in that accepted forward audit record.

#### Scenario: Forwarded message audit includes recipient route
- **WHEN** the relay forwards a schema-valid peer message to the remaining registered recipient
- **THEN** the accepted forward audit record detail includes `messageType`, `recipientPeerId`, and `recipientRole`

#### Scenario: Forwarded signal audit preserves authorization metadata
- **WHEN** the relay forwards a schema-valid `signal` message with a valid top-level payload `authorizationId`
- **THEN** the accepted forward audit record detail includes `messageType`, `authorizationId`, `recipientPeerId`, and `recipientRole`

#### Scenario: Forwarded message audit remains payload-safe
- **WHEN** the relay audits an accepted forwarded message
- **THEN** the audit record detail MUST NOT include raw protocol payloads, display names, private reasons, SDP, ICE candidates, payload markers, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets
### Requirement: Forwarded message identifier audit metadata
The relay runtime SHALL include the parsed protocol `messageId` in accepted `relay.message.forwarded` audit detail after protocol validation and before audit persistence, and MUST NOT include raw protocol payload contents or user display metadata in that accepted forward audit record.

#### Scenario: Forwarded message audit includes message identifier
- **WHEN** the relay forwards a schema-valid peer message
- **THEN** the accepted forward audit record detail includes `messageType`, `messageId`, `recipientPeerId`, and `recipientRole`

#### Scenario: Forwarded signal audit includes message and authorization identifiers
- **WHEN** the relay forwards a schema-valid `signal` message with a valid top-level payload `authorizationId`
- **THEN** the accepted forward audit record detail includes `messageType`, `messageId`, `authorizationId`, `recipientPeerId`, and `recipientRole`

#### Scenario: Forwarded message identifier audit remains payload-safe
- **WHEN** the relay audits an accepted forwarded message
- **THEN** the audit record detail MUST NOT include raw protocol payloads, display names, private reasons, SDP, ICE candidates, payload markers, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, or full secrets
