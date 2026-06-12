# agent-shell-consent-workflow Specification

## Purpose
Defines the non-native agent shell workflow for exercising consent, visible activation, and revocation protocol behavior without implementing remote actions.
## Requirements
### Requirement: Managed agent shell lifecycle
The agent shell SHALL expose a managed runtime with explicit start and stop operations for tests and CLI use. It SHALL send `join-session` when the socket opens. It SHALL send `hello` only after the relay indicates a two-peer room or after receiving an accepted opposite-role peer `hello`, and MUST NOT send `hello` before a relay recipient is available.

#### Scenario: Agent shell starts
- **WHEN** the agent shell runtime starts
- **THEN** it connects to the relay and sends a join message using the same implementation as the CLI

#### Scenario: Relay token remains local to connection setup
- **WHEN** the managed agent shell connects to a token-protected development relay with a configured relay token
- **THEN** local runtime logs and emitted runtime event records MUST NOT include the raw relay token, credentials, pairing codes, protocol payloads, private reasons, keystrokes, screenshots, screen contents, or input contents

#### Scenario: Hello waits for recipient
- **WHEN** the relay returns `relay-ready` with room size 1
- **THEN** the shell MUST NOT send `hello`

#### Scenario: Hello sent when room is paired
- **WHEN** the relay returns `relay-ready` with room size 2 or the shell receives an accepted opposite-role peer `hello`
- **THEN** it sends exactly one `hello` for its local peer before later workflow messages that depend on peer presence
- **AND** sending `hello` MUST NOT approve authorization, activate a visible session, grant permissions, start capture, send input, reconnect a peer, suppress host visibility, or bypass consent workflows

### Requirement: Hello capability metadata remains canonical
The agent shell SHALL rely on shared protocol validation for generated, inbound, and public-send `hello` capability metadata. `hello` capability metadata that is blank, untrimmed, or duplicate after trimming MUST be rejected before it can create peer presence, authorize public sends, emit trusted local `received` or `sent` events, or trigger consent workflow messages.

#### Scenario: Inbound untrimmed capability is rejected
- **WHEN** the runtime receives a `hello`-shaped payload whose capability entry has leading or trailing whitespace
- **THEN** the runtime rejects it before local `received` protocol event emission or peer presence handling

#### Scenario: Inbound trim-duplicate capability is rejected
- **WHEN** the runtime receives a `hello`-shaped payload with capability entries that duplicate after trimming
- **THEN** the runtime rejects it before local `received` protocol event emission or peer presence handling

#### Scenario: Public hello with untrimmed capability is blocked
- **WHEN** caller code invokes public runtime `send()` with a same-session `hello` whose capability entry has leading or trailing whitespace
- **THEN** the runtime rejects the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked hello

#### Scenario: Rejected capability diagnostics remain secret-safe
- **WHEN** the runtime rejects a `hello` because of malformed capability metadata
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw capability values, protocol payloads, display names, tokens, pairing codes, private reasons, keystrokes, screenshots, screen contents, or input contents

### Requirement: Agent shell display names remain canonical
The agent shell SHALL reject CLI, direct runtime, inbound `hello`, and public-send `hello` display-name values that are not already trimmed before opening a relay connection, sending `join-session`, sending `hello`, emitting trusted local protocol events, or running consent workflow handling.

#### Scenario: CLI display name is untrimmed
- **WHEN** the agent shell is started with a `--name` value that has leading or trailing whitespace
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Direct runtime display name is untrimmed
- **WHEN** caller code creates a managed runtime with a display name that has leading or trailing whitespace
- **THEN** runtime creation fails before opening a relay connection or sending any protocol message

#### Scenario: Inbound untrimmed hello display name is rejected
- **WHEN** the runtime receives a `hello`-shaped payload whose display name has leading or trailing whitespace
- **THEN** the runtime rejects it before local `received` protocol event emission or peer presence handling

#### Scenario: Public hello with untrimmed display name is blocked
- **WHEN** caller code invokes public runtime `send()` with a same-session `hello` whose display name has leading or trailing whitespace
- **THEN** the runtime rejects the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked hello

#### Scenario: Rejected display-name diagnostics remain secret-safe
- **WHEN** the runtime rejects display-name metadata because it is malformed
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw display names, protocol payloads, tokens, pairing codes, private reasons, keystrokes, screenshots, screen contents, or input contents

### Requirement: Inbound self-hello boundary
The agent shell SHALL ignore decoded inbound `hello` messages whose `peerId` equals the local runtime peer before emitting local `received` protocol events or running peer presence workflow handling.

#### Scenario: Self-hello is ignored
- **WHEN** a host shell receives a decoded `hello` message whose `peerId` equals the local host peer id
- **THEN** the shell MUST NOT send a local `hello` because of that message
- **AND** the shell MUST NOT emit a local `received` protocol event for that ignored message

#### Scenario: Ignored self-hello input remains secret-safe
- **WHEN** the shell ignores a decoded `hello` message that identifies the local peer
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, display names, capability strings, tokens, pairing codes, private reasons, signal payloads, keystrokes, screenshots, screen contents, or input contents

### Requirement: Inbound same-role hello boundary
The agent shell SHALL ignore decoded inbound `hello` messages whose `role` equals the local runtime role before emitting local `received` protocol events, recording recipient availability, or running peer presence workflow handling.

#### Scenario: Same-role hello is ignored
- **WHEN** a viewer shell receives a decoded `hello` message with role `viewer` from a different peer id in the same session
- **THEN** the shell MUST NOT send a local `hello` because of that message
- **AND** the shell MUST NOT emit a local `received` protocol event for that ignored message
- **AND** the shell MUST NOT treat that message as recipient availability for public runtime `send()`

#### Scenario: Opposite-role hello remains valid presence
- **WHEN** a host shell receives a decoded `hello` message with role `viewer` from a different peer id in the same session
- **THEN** the shell MAY treat that message as peer presence and send exactly one local `hello`

#### Scenario: Ignored same-role hello input remains secret-safe
- **WHEN** the shell ignores a decoded `hello` message that declares the local runtime role
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, roles, display names, capability strings, tokens, pairing codes, private reasons, signal payloads, keystrokes, screenshots, screen contents, or input contents

### Requirement: Inbound relay-ready peer boundary
The agent shell SHALL ignore decoded inbound `relay-ready` messages whose `peerId` does not match the local runtime peer before emitting local `received` protocol events or using room metadata for presence or authorization request workflow handling.

#### Scenario: Foreign relay-ready is ignored
- **WHEN** a viewer shell receives a decoded `relay-ready` whose `peerId` does not equal the local viewer peer id
- **THEN** the shell MUST NOT send `hello` or `session-authorization-request` because of that message
- **AND** the shell MUST NOT emit a local `received` protocol event for that ignored message

#### Scenario: Ignored foreign relay-ready input remains secret-safe
- **WHEN** the shell ignores a decoded `relay-ready` that identifies a different peer
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, tokens, pairing codes, private reasons, signal payloads, keystrokes, screenshots, screen contents, or input contents

### Requirement: Managed runtime option validation
The managed agent shell runtime SHALL validate direct runtime options before opening a relay connection or sending any protocol message. Invalid role, relay URL, relay token, identifiers, display name, requested permissions, revoke permission, visible session flag, host decision, workflow timer delays, or blank, untrimmed, or oversized workflow reason options MUST fail closed before relay startup. Relay runtime token values MUST be non-blank, already trimmed, 1024 UTF-8 bytes or less, and contain no ASCII control characters. Relay URLs MUST NOT carry embedded credentials or token query parameters; relay shared tokens MUST use the dedicated runtime token path.

#### Scenario: Malformed runtime options fail before relay startup
- **WHEN** caller code creates a managed runtime with an invalid relay URL, session id, pairing code, peer id, device id, display name, requested permission, revoke permission, visible session flag, host decision, workflow timer delay, or workflow reason
- **THEN** runtime creation fails before opening a relay connection
- **AND** it MUST NOT send join, authorization, lifecycle, signal, or audit messages

#### Scenario: Untrimmed runtime workflow reason fails before relay startup
- **WHEN** caller code creates a managed runtime with a workflow reason option containing leading or trailing whitespace
- **THEN** runtime creation fails before opening a relay connection or sending any protocol message

#### Scenario: Untrimmed runtime display name fails before relay startup
- **WHEN** caller code creates a managed runtime with a display name that has leading or trailing whitespace
- **THEN** runtime creation fails before opening a relay connection or sending any protocol message

#### Scenario: Relay URL credentials are rejected
- **WHEN** caller code creates a managed runtime with a relay URL containing a username, password, empty userinfo marker, or `token` query parameter
- **THEN** runtime creation fails before opening a relay connection
- **AND** the runtime requires relay shared tokens to be provided through the dedicated token option instead of the URL

#### Scenario: Malformed runtime token is rejected
- **WHEN** caller code creates a managed runtime with an empty, whitespace-only, untrimmed, control-character, oversized, or non-string relay token
- **THEN** runtime creation fails before opening a relay connection

### Requirement: Sent runtime events are secret-safe
The agent shell SHALL emit local `sent` runtime events using a validated and redacted protocol event view that does not expose raw secrets.

#### Scenario: Sent join-session pairing code is redacted
- **WHEN** the managed runtime sends a `join-session` protocol message
- **THEN** the local `sent` runtime event MUST NOT expose the raw pairing code

#### Scenario: Sent audit event detail is redacted
- **WHEN** the managed runtime sends an `audit-event` whose detail contains sensitive keys such as tokens or credentials
- **THEN** the local `sent` runtime event exposes the redacted detail and MUST NOT expose the raw sensitive values

#### Scenario: Invalid outbound message emits no sent event
- **WHEN** the managed runtime is asked to send a malformed protocol message
- **THEN** it rejects the send before emitting a local `sent` runtime event

### Requirement: Public send session binding
The agent shell SHALL reject public managed runtime `send()` calls before socket write and before local `sent` event emission when the outbound protocol envelope `sessionId` does not match the local runtime session.

#### Scenario: Cross-session public request send is blocked
- **WHEN** caller code invokes public runtime `send()` with a protocol request envelope whose `sessionId` differs from the local runtime session
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked envelope

#### Scenario: Cross-session authorized signal send is blocked
- **WHEN** caller code invokes public runtime `send()` with a `signal` envelope whose `sessionId` differs from the local runtime session
- **AND** the runtime has active visible `screen:view` authorization
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked signal

#### Scenario: Same-session public send gates remain available
- **WHEN** caller code invokes public runtime `send()` with an envelope whose `sessionId` matches the local runtime session
- **THEN** the runtime MAY continue to apply later workflow-authority, signal routing, signal authorization, socket, and protocol validation gates

#### Scenario: Blocked cross-session send diagnostics are secret-safe
- **WHEN** the runtime blocks a public send because its `sessionId` differs from the local runtime session
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw protocol payloads, message types, session ids, peer ids, signal payloads, signal payload keys, tokens, pairing codes, private reasons, keystrokes, screenshots, screen contents, or input contents

### Requirement: Public send authority binding
The agent shell SHALL reject public managed runtime `send()` calls before socket write and before local `sent` event emission when the outbound protocol envelope is join-only, relay-originated, spoofs the local peer identity or role, or sends viewer-originated request messages from a non-viewer runtime or on behalf of another viewer peer.

#### Scenario: Public join and relay lifecycle sends are blocked
- **WHEN** caller code invokes public runtime `send()` with `join-session`, `relay-ready`, or `peer-disconnected`
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked envelope

#### Scenario: Public spoofed hello is blocked
- **WHEN** caller code invokes public runtime `send()` with a `hello` whose `peerId` or `role` differs from the local runtime peer id or role
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked hello

#### Scenario: Public role-mismatched viewer request is blocked
- **WHEN** caller code invokes public runtime `send()` with `host-consent-required` or `session-authorization-request`
- **AND** the local runtime role is not `viewer` or the request `viewerPeerId` differs from the local runtime peer id
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked request

#### Scenario: Same-viewer public request remains available
- **WHEN** caller code invokes public runtime `send()` from a viewer runtime with a same-session `host-consent-required` or `session-authorization-request` whose `viewerPeerId` equals the local runtime peer id
- **THEN** the public-send authority gate MUST NOT treat that request as a grant or decision
- **AND** that request MUST NOT approve authorization, activate visibility, grant permissions, start capture, send input, reconnect a peer, suppress host visibility, or bypass consent workflows

#### Scenario: Blocked public-send authority diagnostics are secret-safe
- **WHEN** the runtime blocks a public send because of join-only, relay-originated, spoofed identity, or role-mismatched request authority
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw protocol payloads, message types, session ids, peer ids, roles, display names, permission scopes, signal payloads, tokens, pairing codes, private reasons, keystrokes, screenshots, screen contents, or input contents

### Requirement: Public send recipient binding
The agent shell SHALL reject public managed runtime `send()` calls for peer-directed protocol messages before socket write and before local `sent` event emission until the runtime has observed a recipient peer through an accepted paired `relay-ready` message or an accepted inbound opposite-role peer `hello`. Recipient availability SHALL be connection-scoped and SHALL be cleared after a trusted remote peer disconnect notice.

#### Scenario: Public hello waits for recipient
- **WHEN** caller code invokes public runtime `send()` with a same-session `hello` whose peer id and role match the local runtime
- **AND** the runtime has not observed a paired room or peer `hello`
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked hello

#### Scenario: Public viewer request waits for recipient
- **WHEN** caller code invokes public runtime `send()` from a viewer runtime with a same-session `host-consent-required` or `session-authorization-request` whose `viewerPeerId` equals the local runtime peer id
- **AND** the runtime has not observed a paired room or peer `hello`
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked request

#### Scenario: Public peer sends fail after remote disconnect
- **WHEN** the runtime has observed a recipient peer
- **AND** the runtime receives a trusted remote `peer-disconnected` notice
- **THEN** later public peer-message sends MUST fail before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for those blocked sends

#### Scenario: Paired public viewer request remains available
- **WHEN** caller code invokes public runtime `send()` from a viewer runtime with a same-session `host-consent-required` or `session-authorization-request` whose `viewerPeerId` equals the local runtime peer id
- **AND** the runtime has observed a recipient peer
- **THEN** the recipient gate MUST NOT treat that request as a grant or decision
- **AND** that request MUST NOT approve authorization, activate visibility, grant permissions, start capture, send input, reconnect a peer, suppress host visibility, or bypass consent workflows

#### Scenario: Blocked public-send recipient diagnostics are secret-safe
- **WHEN** the runtime blocks a public send because no recipient peer has been observed
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw protocol payloads, message types, session ids, peer ids, display names, permission scopes, signal payloads, tokens, pairing codes, private reasons, keystrokes, screenshots, screen contents, or input contents

### Requirement: Sent signal runtime events are secret-safe
The agent shell SHALL emit local `sent` runtime events for `signal` messages without exposing raw signal payload contents, tokens, pairing codes, credentials, parser details, protocol payload fragments, keystrokes, screenshots, screen contents, or input contents.

#### Scenario: Sent signal payload is redacted
- **WHEN** the managed runtime sends a valid `signal` protocol message
- **THEN** the local `sent` runtime event MUST identify the signal message and peer routing metadata but MUST NOT expose the raw signal payload contents

#### Scenario: Sent signal event keeps safe diagnostics
- **WHEN** the managed runtime emits a local `sent` event for a `signal` message
- **THEN** the event MAY expose secret-safe metadata such as original payload byte length

### Requirement: Outbound signal peer binding
The agent shell SHALL reject public managed runtime `send()` calls for `signal` messages before socket write and before local `sent` event emission when the signal sender does not identify the local runtime peer or when an explicit signal target does not identify the authorized remote peer for the active authorization.

#### Scenario: Spoofed signal sender is blocked
- **WHEN** caller code invokes public runtime `send()` with a `signal` whose `fromPeerId` differs from the local runtime peer id
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked signal

#### Scenario: Self-targeted signal is blocked
- **WHEN** caller code invokes public runtime `send()` with a `signal` whose explicit `toPeerId` equals the local runtime peer id
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked signal

#### Scenario: Third-peer signal target is blocked
- **WHEN** caller code invokes public runtime `send()` with a `signal` whose explicit `toPeerId` identifies a peer other than the authorized remote peer
- **AND** the runtime has active visible `screen:view` authorization
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked signal

#### Scenario: Authorized signal routing remains available
- **WHEN** caller code invokes public runtime `send()` with a `signal` whose `fromPeerId` equals the local runtime peer id and whose explicit `toPeerId`, when present, equals the authorized remote peer
- **AND** the runtime has active visible `screen:view` authorization
- **THEN** the signal MAY be written to the socket
- **AND** the local `sent` event MUST continue to redact the signal payload contents

#### Scenario: Blocked outbound signal routing diagnostics are secret-safe
- **WHEN** the runtime blocks a public `signal` send because the sender is spoofed, the explicit target is the local runtime peer, or the explicit target is not the authorized remote peer
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw signal payloads, signal payload keys, tokens, pairing codes, authorization reasons, peer ids, keystrokes, screenshots, screen contents, or input contents

### Requirement: Viewer signal authorization gate
The agent shell SHALL block viewer-originated `signal` sends before socket write and before local `sent` event emission unless the viewer has observed a host-originated active, visible, unexpired authorization state that grants `screen:view`.

#### Scenario: Viewer signal is blocked before authorization
- **WHEN** a viewer runtime is connected and attempts to send a `signal` message before receiving an active visible authorization state with `screen:view`
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked signal

#### Scenario: Viewer signal is allowed after active visible grant
- **WHEN** a viewer runtime receives an active `session-authorization-state` with `visibleToHost: true`, unexpired `expiresAt`, and `screen:view`
- **THEN** a viewer-originated `signal` message MAY be sent through the runtime send path
- **AND** the local `sent` event MUST continue to redact the signal payload contents

#### Scenario: Viewer signal fails closed after revoke control, revocation, pause, termination, or expiration
- **WHEN** a viewer runtime has previously observed an active visible `screen:view` state
- **AND** it then observes a bound revoke-permission `session-control` for `screen:view`, a permission revocation that removes `screen:view`, a pause control, a state whose status is not `active`, or the authorization expires
- **THEN** later viewer-originated `signal` sends MUST be rejected before socket write and local `sent` event emission

#### Scenario: Blocked viewer signal diagnostics are secret-safe
- **WHEN** the runtime blocks a viewer-originated `signal` send because active visible `screen:view` authorization is missing
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw signal payloads, signal payload keys, tokens, pairing codes, authorization reasons, keystrokes, screenshots, screen contents, or input contents

### Requirement: Viewer authorization authority binding
The agent shell SHALL bind viewer-side authorization lifecycle state to the host authority from a `session-authorization-decision` addressed to the local viewer before using lifecycle messages to authorize viewer-originated `signal` sends. Viewer-side `session-control` messages MUST match both the bound host authority and the current authorization id before they can change local authorization state. The viewer runtime MUST ignore inbound legacy `host-consent-decision` messages before local `received` protocol event emission and MUST NOT treat them as authorization decisions.

#### Scenario: Viewer ignores authorization state without bound decision
- **WHEN** a viewer runtime receives a decoded `session-authorization-state` before it has received a `session-authorization-decision` for the local viewer and matching authorization id
- **THEN** the runtime MUST ignore that state before local `received` protocol event emission
- **AND** later viewer-originated `signal` sends MUST still be rejected before socket write and local `sent` event emission

#### Scenario: Viewer ignores mismatched authorization authority
- **WHEN** a viewer runtime has received a `session-authorization-decision` for the local viewer from one host authority
- **AND** it then receives `session-authorization-state`, `permission-revoked`, or `session-control` from a different actor authority for the same session
- **THEN** the runtime MUST ignore the mismatched lifecycle message before local `received` protocol event emission
- **AND** the mismatched message MUST NOT grant, restore, pause, revoke, terminate, or otherwise alter viewer signal-send authorization

#### Scenario: Viewer ignores mismatched session-control authorization id
- **WHEN** a viewer runtime has received a host decision and active visible state for one authorization id
- **AND** it then receives `session-control` from the bound host authority with a different authorization id
- **THEN** the runtime MUST ignore the mismatched control before local `received` protocol event emission
- **AND** the mismatched control MUST NOT pause, resume, terminate, revoke, restore, or otherwise alter viewer signal-send authorization

#### Scenario: Viewer ignores legacy host consent decision
- **WHEN** a viewer runtime receives a decoded legacy `host-consent-decision` addressed to the local viewer
- **THEN** the runtime MUST ignore that legacy decision before local `received` protocol event emission
- **AND** the ignored legacy decision MUST NOT bind host authority, grant permissions, activate visibility, authorize viewer-originated `signal` sends, start capture, send input, suppress host visibility, or bypass consent workflows

#### Scenario: Viewer ignores decisions for another viewer
- **WHEN** a viewer runtime receives a `session-authorization-decision` whose `viewerPeerId` does not identify the local viewer
- **THEN** the runtime MUST ignore that decision before local `received` protocol event emission
- **AND** the ignored decision MUST NOT bind host authority or authorize viewer-originated `signal` sends

#### Scenario: Viewer denied decision remains fail-closed
- **WHEN** a viewer runtime receives a denied `session-authorization-decision` for the local viewer
- **AND** it later receives an active `session-authorization-state` or `session-control` for the same authorization id and host authority
- **THEN** the runtime MUST ignore the lifecycle message before local `received` protocol event emission
- **AND** later viewer-originated `signal` sends MUST still be rejected before socket write and local `sent` event emission

#### Scenario: Viewer restart clears authorization authority binding
- **WHEN** a viewer runtime object is stopped and started again after previously observing active visible `screen:view` authorization
- **THEN** the restarted runtime MUST NOT treat the prior connection's decision, host authority, or authorization state as active
- **AND** viewer-originated `signal` sends MUST be rejected until the restarted runtime receives a new local-viewer decision and matching active visible state

#### Scenario: Ignored viewer authorization authority diagnostics are secret-safe
- **WHEN** the viewer runtime ignores an unbound or mismatched authorization lifecycle message, or ignores a legacy host consent decision
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, authorization ids, actor ids, signal payloads, tokens, pairing codes, private reasons, grant scopes, keystrokes, screenshots, screen contents, or input contents

### Requirement: Host inbound signal authorization gate
The agent shell SHALL ignore inbound `signal` messages at the host before local `received` event emission or received signal summary logging unless the host runtime has locally emitted an active, visible, unexpired authorization state that grants `screen:view`.

#### Scenario: Host ignores inbound signal before active visible authorization
- **WHEN** a host runtime receives a decoded inbound `signal` before it has emitted active visible `screen:view` authorization
- **THEN** the runtime MUST NOT emit a local `received` protocol event for that signal
- **AND** the runtime MUST NOT log a received signal summary for that signal

#### Scenario: Host accepts inbound signal after active visible grant
- **WHEN** a host runtime has emitted an active `session-authorization-state` with `visibleToHost: true`, unexpired `expiresAt`, and `screen:view`
- **THEN** a correctly addressed inbound `signal` from the remote viewer MAY emit a local `received` event
- **AND** that received event MUST continue to redact the signal payload contents

#### Scenario: Host inbound signal fails closed after pause, revocation, termination, or expiration
- **WHEN** a host runtime has previously emitted an active visible `screen:view` state
- **AND** the local workflow then pauses, removes `screen:view`, terminates, or expires that authorization
- **THEN** later inbound `signal` messages MUST be ignored before local `received` event emission and received signal summary logging

#### Scenario: Host restart clears inbound signal authorization
- **WHEN** a host runtime object is stopped and started again after previously emitting active visible `screen:view` authorization
- **THEN** the restarted runtime MUST NOT treat the prior connection's authorization as active for inbound `signal` messages
- **AND** inbound `signal` messages MUST be ignored until the restarted runtime emits a new active visible `screen:view` state

#### Scenario: Ignored host inbound signal diagnostics are secret-safe
- **WHEN** the host runtime ignores an inbound `signal` because authorization is missing, inactive, invisible, expired, or no longer grants `screen:view`
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, signal payloads, signal payload keys, tokens, pairing codes, private reasons, keystrokes, screenshots, screen contents, or input contents

### Requirement: Host signal send authorization gate
The agent shell SHALL block host-originated public runtime `signal` sends before socket write and before local `sent` event emission unless the host runtime has locally emitted an active, visible, unexpired authorization state that grants `screen:view`.

#### Scenario: Host signal is blocked before authorization
- **WHEN** a host runtime is connected and caller code invokes public `send()` with a `signal` message before the host has emitted active visible `screen:view` authorization
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked signal

#### Scenario: Host signal is allowed after active visible grant
- **WHEN** a host runtime has emitted an active `session-authorization-state` with `visibleToHost: true`, unexpired `expiresAt`, and `screen:view`
- **THEN** a host-originated public runtime `signal` message MAY be sent through the runtime send path
- **AND** the local `sent` event MUST continue to redact the signal payload contents

#### Scenario: Host signal fails closed after pause, revocation, termination, or expiration
- **WHEN** a host runtime has previously emitted an active visible `screen:view` state
- **AND** the local workflow then pauses, removes `screen:view`, terminates, or expires that authorization
- **THEN** later host-originated public runtime `signal` sends MUST be rejected before socket write and local `sent` event emission

#### Scenario: Host signal lifecycle callbacks observe updated authorization
- **WHEN** host workflow emits a local `sent` event for active authorization state, pause, permission revocation, termination, or expiration
- **THEN** synchronous caller code running inside that local event callback MUST observe the updated authorization state for host-originated public runtime `signal` send checks
- **AND** it MUST NOT be able to send `signal` using stale authorization after pause, permission revocation, termination, or expiration

#### Scenario: Host restart clears signal send authorization
- **WHEN** a host runtime object is stopped and started again after previously emitting active visible `screen:view` authorization
- **THEN** the restarted runtime MUST NOT treat the prior connection's authorization as active for host-originated public runtime `signal` sends
- **AND** host-originated public runtime `signal` sends MUST be rejected until the restarted runtime emits a new active visible `screen:view` state

#### Scenario: Blocked host signal diagnostics are secret-safe
- **WHEN** the runtime blocks a host-originated public runtime `signal` because authorization is missing, inactive, invisible, expired, or no longer grants `screen:view`
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw signal payloads, signal payload keys, tokens, pairing codes, authorization reasons, keystrokes, screenshots, screen contents, or input contents

### Requirement: Public workflow-authority send gate
The agent shell SHALL reject public managed runtime `send()` calls for workflow-authority protocol messages before socket write and before local `sent` event emission. Workflow-authority protocol messages include `host-consent-decision`, `session-authorization-decision`, `session-authorization-state`, `permission-revoked`, `session-control`, and `audit-event`.

#### Scenario: Public legacy host consent decision send is blocked
- **WHEN** caller code invokes public runtime `send()` with a legacy `host-consent-decision`
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked legacy decision

#### Scenario: Public authorization decision send is blocked
- **WHEN** caller code invokes public runtime `send()` with a `session-authorization-decision`
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked decision

#### Scenario: Public authorization lifecycle send is blocked
- **WHEN** caller code invokes public runtime `send()` with `session-authorization-state`, `permission-revoked`, or `session-control`
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked lifecycle message

#### Scenario: Public workflow audit send is blocked
- **WHEN** caller code invokes public runtime `send()` with an `audit-event`
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked audit event

#### Scenario: Public legacy host consent request remains a request
- **WHEN** caller code invokes public runtime `send()` with a legacy `host-consent-required`
- **THEN** the workflow-authority gate MUST NOT treat that request as a grant or decision
- **AND** that request MUST NOT approve authorization, activate visibility, grant permissions, start capture, send input, reconnect a peer, suppress host visibility, or bypass consent workflows

#### Scenario: Internal explicit workflow sends still work
- **WHEN** the host workflow has explicit host decision configuration and visible activation, revocation, pause, resume, termination, or expiration configuration
- **THEN** the internal workflow MAY emit matching authorization, lifecycle, and development audit-event messages through its internal send path
- **AND** those internal sends MUST still preserve existing consent, visibility, revocation, timeout, peer-disconnect, and audit safety gates

#### Scenario: Blocked workflow-authority diagnostics are secret-safe
- **WHEN** the runtime blocks a public workflow-authority send
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw protocol payloads, payload keys, tokens, pairing codes, authorization reasons, audit-event details, keystrokes, screenshots, screen contents, or input contents

### Requirement: Runtime event reasons are secret-safe
The agent shell SHALL emit local `sent` and `received` runtime events without exposing raw protocol `reason` text from authorization, permission, lifecycle, control, or other reason-bearing protocol messages.

#### Scenario: Sent protocol reason is redacted
- **WHEN** the managed runtime sends a protocol message with a `reason` field
- **THEN** the local `sent` runtime event MUST preserve the message type and consent workflow metadata but MUST NOT expose the raw reason text

#### Scenario: Received protocol reason is redacted
- **WHEN** the managed runtime receives a valid protocol message with a `reason` field
- **THEN** the local `received` runtime event MUST preserve the message type and consent workflow metadata but MUST NOT expose the raw reason text

#### Scenario: Wire behavior is unchanged
- **WHEN** the managed runtime sends or handles reason-bearing protocol messages
- **THEN** reason redaction MUST apply only to the local runtime event view and MUST NOT change protocol validation, socket send behavior, relay forwarding, or internal workflow handling

### Requirement: Inbound workflow self-authority boundary
The agent shell SHALL ignore decoded inbound legacy consent decisions, authorization lifecycle messages, and audit workflow messages that identify the local runtime peer as the authority actor before emitting local `received` protocol events or received workflow summary logs.

#### Scenario: Self-origin legacy host consent decision is ignored
- **WHEN** a host shell receives a decoded legacy `host-consent-decision` whose `hostPeerId` equals the local host peer id
- **THEN** the shell MUST NOT emit a local `received` protocol event for that ignored message
- **AND** the shell MUST NOT log a received workflow summary for that ignored message

#### Scenario: Self-origin authorization decision is ignored
- **WHEN** a host shell receives a decoded `session-authorization-decision` whose `hostPeerId` equals the local host peer id
- **THEN** the shell MUST NOT emit a local `received` protocol event for that ignored message
- **AND** the shell MUST NOT log a received workflow summary for that ignored message

#### Scenario: Self-origin actor workflow messages are ignored
- **WHEN** a host shell receives a decoded `session-authorization-state`, `session-control`, `permission-revoked`, or `audit-event` whose `actorPeerId` equals the local host peer id
- **THEN** the shell MUST NOT emit a local `received` protocol event for that ignored message
- **AND** the shell MUST NOT log a received workflow summary for that ignored message

#### Scenario: Ignored self-authority input remains secret-safe
- **WHEN** the shell ignores a decoded inbound workflow authority message because of local peer authority metadata
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, authorization ids, audit ids, workflow actions, tokens, pairing codes, private reasons, signal payloads, keystrokes, screenshots, screen contents, or input contents

### Requirement: Inbound session boundary
The agent shell SHALL ignore decoded inbound protocol messages whose `sessionId` does not match the local runtime session before emitting local `received` protocol events or running consent workflow handling.

#### Scenario: Cross-session authorization request is ignored
- **WHEN** a host shell receives a decoded `session-authorization-request` for a different session id
- **THEN** the shell MUST NOT send a host authorization decision, authorization state update, or workflow audit-event for that request
- **AND** the shell MUST NOT emit a local `received` protocol event for that cross-session request

#### Scenario: Cross-session input remains secret-safe
- **WHEN** the shell ignores a decoded inbound protocol message for a different session id
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, tokens, pairing codes, private reasons, signal payloads, keystrokes, screenshots, screen contents, or input contents

### Requirement: Inbound self-authority boundary
The agent shell SHALL ignore decoded inbound authorization requests that identify the local peer as the remote viewer before emitting local `received` protocol events or running consent workflow handling.

#### Scenario: Self-referential authorization request is ignored
- **WHEN** a host shell receives a decoded `session-authorization-request` whose `viewerPeerId` equals the local host peer id
- **THEN** the shell MUST NOT send a host authorization decision, authorization state update, or workflow audit-event for that request
- **AND** the shell MUST NOT emit a local `received` protocol event for that ignored request

#### Scenario: Ignored self-authority input remains secret-safe
- **WHEN** the shell ignores a decoded authorization request that identifies the local peer as the requester
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, peer ids, tokens, pairing codes, private reasons, signal payloads, keystrokes, screenshots, screen contents, or input contents

### Requirement: Received signal runtime events are secret-safe
The agent shell SHALL emit local `received` runtime events for `signal` messages without exposing raw signal payload contents, tokens, pairing codes, credentials, parser details, protocol payload fragments, keystrokes, screenshots, screen contents, or input contents.

#### Scenario: Received signal payload is redacted
- **WHEN** the managed runtime receives a valid `signal` protocol message
- **THEN** the local `received` runtime event MUST identify the signal message and peer routing metadata but MUST NOT expose the raw signal payload contents

#### Scenario: Received signal event keeps safe diagnostics
- **WHEN** the managed runtime emits a local `received` event for a `signal` message
- **THEN** the event MAY expose secret-safe metadata such as original payload byte length

### Requirement: Canonical signal event byte-length metadata
The agent shell SHALL calculate redacted sent and received `signal` runtime event byte-length metadata using the shared canonical JSON byte length, and inherited `toJSON` hooks or prototype pollution MUST NOT alter that metadata.

#### Scenario: Sent signal byte length ignores inherited toJSON hooks
- **WHEN** the managed runtime emits a local `sent` event for a valid `signal` while an inherited `toJSON` hook is present
- **THEN** the event payload remains redacted
- **AND** the event byte length equals the canonical JSON byte length of the signal payload
- **AND** the event MUST NOT expose raw signal payload contents or fields injected by inherited `toJSON` hooks

#### Scenario: Received signal byte length ignores inherited toJSON hooks
- **WHEN** the managed runtime emits a local `received` event for a valid `signal` while an inherited `toJSON` hook is present
- **THEN** the event payload remains redacted
- **AND** the event byte length equals the canonical JSON byte length of the signal payload
- **AND** the event MUST NOT expose raw signal payload contents or fields injected by inherited `toJSON` hooks

### Requirement: Inbound signal peer boundary
The agent shell SHALL ignore decoded inbound `signal` messages that are not addressed to the local runtime peer or that identify the local runtime peer as the sender before emitting local `received` protocol events or received signal summary logs.

#### Scenario: Signal for another peer is ignored
- **WHEN** a host shell receives a decoded `signal` whose `toPeerId` does not equal the local host peer id
- **THEN** the shell MUST NOT emit a local `received` protocol event for that ignored message
- **AND** the shell MUST NOT log a received signal summary for that ignored message

#### Scenario: Self-origin signal is ignored
- **WHEN** a host shell receives a decoded `signal` whose `fromPeerId` equals the local host peer id
- **THEN** the shell MUST NOT emit a local `received` protocol event for that ignored message
- **AND** the shell MUST NOT log a received signal summary for that ignored message

#### Scenario: Ignored signal input remains secret-safe
- **WHEN** the shell ignores a decoded inbound `signal` because of peer routing metadata
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, signal payloads, signal payload keys, tokens, pairing codes, private reasons, keystrokes, screenshots, screen contents, or input contents

### Requirement: Raw runtime events are secret-safe
The agent shell SHALL emit local `raw` runtime events without exposing raw non-protocol inbound text, parser details, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, or input contents.

#### Scenario: Non-protocol inbound text is redacted
- **WHEN** the managed runtime receives inbound text that cannot be decoded as a protocol envelope
- **THEN** the local `raw` runtime event MUST expose only secret-safe metadata such as byte length and MUST NOT expose the original text

#### Scenario: Relay parser details are not exposed
- **WHEN** the managed runtime receives a relay rejection or other malformed inbound text that includes parser details or raw payload fragments
- **THEN** the local `raw` runtime event MUST NOT expose those details or fragments

### Requirement: Canonical raw inbound byte metadata
The agent shell SHALL calculate non-protocol and ignored unsafe inbound message `byteLength` metadata from the actual WebSocket payload bytes before text conversion, while continuing to redact raw payload contents from local events and logs.

#### Scenario: Binary non-protocol byte length is accurate
- **WHEN** the managed runtime receives a binary or invalid UTF-8 WebSocket message that cannot be decoded as a protocol envelope
- **THEN** the local `raw` event `byteLength` equals the original WebSocket payload byte length
- **AND** the local log includes that byte length only as summary metadata
- **AND** neither the event nor the log exposes the raw payload contents

#### Scenario: Ignored unsafe inbound byte metadata does not grant access
- **WHEN** the managed runtime emits byte metadata for an ignored unsafe inbound message
- **THEN** that metadata MUST NOT approve authorization, activate a visible session, grant permissions, start capture, send input, reconnect the peer, suppress host visibility, or bypass consent workflows

### Requirement: Closed runtime events are secret-safe
The agent shell SHALL emit local `closed` runtime events without exposing raw WebSocket close reasons, tokens, pairing codes, credentials, parser details, protocol payload fragments, keystrokes, screenshots, screen contents, or input contents.

#### Scenario: WebSocket close reason is redacted
- **WHEN** the managed runtime receives a WebSocket close frame with a reason
- **THEN** the local `closed` runtime event MUST expose only secret-safe metadata such as close code and reason byte length and MUST NOT expose the raw reason text

#### Scenario: Disconnect log remains summary-only
- **WHEN** the managed runtime logs a WebSocket disconnect
- **THEN** the log MUST include only summary metadata and MUST NOT include the raw close reason text

### Requirement: Canonical close reason byte metadata
The agent shell SHALL calculate redacted WebSocket close event and disconnect log `reasonBytes` metadata as the actual UTF-8 byte length of the close reason, while continuing to redact the raw close reason text.

#### Scenario: Multi-byte close reason metadata is accurate
- **WHEN** the managed runtime receives a WebSocket close reason containing multi-byte text
- **THEN** the local `closed` event `reasonBytes` equals the UTF-8 byte length of the close reason
- **AND** the local disconnect log includes that byte length only as summary metadata
- **AND** neither the event nor the log exposes the raw close reason text

#### Scenario: Close reason metadata does not grant access
- **WHEN** the managed runtime emits close reason byte metadata
- **THEN** that metadata MUST NOT approve authorization, activate a visible session, grant permissions, start capture, send input, reconnect the peer, suppress host visibility, or bypass consent workflows

### Requirement: Runtime error diagnostics are secret-safe
The agent shell SHALL surface runtime and socket failures without exposing raw exception messages, tokens, pairing codes, credentials, protocol payload fragments, private reason text, file paths, keystrokes, screenshots, screen contents, or input contents in local runtime events or logs.

#### Scenario: Audit sink failure event is redacted
- **WHEN** the configured host workflow audit sink throws an error while writing a record
- **THEN** the host shell MUST emit a local runtime `error` event with a generic error message and secret-safe metadata, and MUST NOT expose the raw exception message

#### Scenario: Runtime error log is redacted
- **WHEN** the agent shell logs a runtime callback failure
- **THEN** the log MUST include only summary metadata such as raw message byte length and MUST NOT include the raw exception message

#### Scenario: Socket error log is redacted
- **WHEN** the agent shell logs a WebSocket error
- **THEN** the log MUST include only summary metadata such as raw message byte length and MUST NOT include the raw socket error message

### Requirement: Agent shell CLI unexpected errors are secret-safe
The agent shell CLI SHALL report unexpected startup and shutdown failures without exposing raw exception messages, stack traces, local file paths, relay tokens, pairing codes, credentials, protocol payload fragments, private workflow reason text, keystrokes, screenshots, screen contents, or input contents.

#### Scenario: Unexpected startup failure output is metadata-only
- **WHEN** the agent shell CLI reports an unexpected startup failure
- **THEN** stderr output MUST include a generic agent-shell error diagnostic with summary metadata such as raw message byte length
- **AND** stderr output MUST NOT include the raw exception message or stack trace

#### Scenario: Unexpected shutdown failure output is metadata-only
- **WHEN** the agent shell CLI reports an unexpected shutdown failure
- **THEN** stderr output MUST include a generic agent-shell error diagnostic with summary metadata such as raw message byte length
- **AND** stderr output MUST NOT include the raw exception message or stack trace

#### Scenario: Usage errors remain bounded
- **WHEN** the agent shell CLI rejects malformed arguments with a usage error
- **THEN** stderr output MAY include the static usage text
- **AND** stderr output MUST NOT include raw user-provided argument values

### Requirement: Agent shell CLI argument validation
The agent shell SHALL reject malformed, unknown, or ambiguous CLI arguments before starting the runtime, including duplicate requested permissions. Relay URLs MUST NOT contain embedded credentials/userinfo, and relay shared-token values MUST be supplied through `--token` rather than embedded in `--relay` URLs. CLI token values MUST be non-blank, already trimmed, 1024 UTF-8 bytes or less, and contain no ASCII control characters. Workflow timer validation SHALL include `--disconnect-after-ms`.

#### Scenario: Unknown CLI option is rejected
- **WHEN** the agent shell is started with an option name that is not part of the documented CLI
- **THEN** it exits through bounded usage handling before connecting to the relay

#### Scenario: Invalid relay URL option is rejected
- **WHEN** the agent shell is started with a malformed, relative, or non-WebSocket `--relay` URL
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Relay URL credentials are rejected
- **WHEN** the agent shell is started with a `--relay` value containing username or password/userinfo credentials
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Relay URL token query is rejected
- **WHEN** the agent shell is started with a `--relay` value containing a `token` query parameter
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Visible session value is explicit
- **WHEN** the agent shell is started with `--visible-session`
- **THEN** the value MUST be either `true` or `false`

#### Scenario: Invalid permission option is rejected
- **WHEN** the agent shell is started with an invalid requested or revocation permission value
- **THEN** it exits through bounded usage handling before sending any protocol message

#### Scenario: Duplicate requested permission is rejected
- **WHEN** the agent shell is started with the same requested permission more than once
- **THEN** it exits through bounded usage handling before connecting to the relay or sending a session authorization request

#### Scenario: Invalid identifier option is rejected
- **WHEN** the agent shell is started with a malformed `--session`, `--peer`, or `--device` identifier
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Invalid display name option is rejected
- **WHEN** the agent shell is started with an empty, whitespace-only, untrimmed, or oversized `--name` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Malformed token option is rejected
- **WHEN** the agent shell is started with an empty, whitespace-only, untrimmed, control-character, or oversized `--token` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Oversized workflow timer option is rejected
- **WHEN** the agent shell is started with `--authorization-ttl-ms`, `--revoke-after-ms`, `--pause-after-ms`, `--resume-after-ms`, `--terminate-after-ms`, or `--disconnect-after-ms` above the safe timer delay bound
- **THEN** it exits through bounded usage handling before connecting to the relay or scheduling workflow timers

#### Scenario: Invalid lifecycle reason option is rejected
- **WHEN** the agent shell is started with a blank, untrimmed, or oversized lifecycle reason option
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Blank audit log path option is rejected
- **WHEN** the agent shell is started with an empty or whitespace-only `--audit-log` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Valid omitted options keep safe defaults
- **WHEN** the agent shell is started with only a valid role
- **THEN** omitted consent-sensitive options keep fail-closed defaults such as no requested permissions, no host decision, and no visible session

#### Scenario: CLI parses disconnect simulation delay
- **WHEN** the agent shell is started with a valid `--disconnect-after-ms` value
- **THEN** it constructs a matching bounded runtime disconnect delay option

### Requirement: Viewer authorization request
The viewer shell SHALL send a session authorization request only when requested permissions are explicitly configured and the relay has indicated a paired two-peer room.

#### Scenario: Viewer requests screen view
- **WHEN** the viewer shell is started with requested `screen:view` permission
- **AND** the relay indicates a two-peer room
- **THEN** it sends a `session-authorization-request` message after joining the relay

#### Scenario: Viewer request waits for paired room
- **WHEN** the viewer shell has requested permissions configured
- **AND** the relay returns `relay-ready` with room size 1
- **THEN** it MUST NOT send a `session-authorization-request`
- **AND** it MUST NOT approve authorization, activate a visible session, grant permissions, start capture, send input, reconnect a peer, suppress host visibility, or bypass consent workflows

### Requirement: Host authorization request peer binding
The agent shell SHALL ignore decoded inbound `session-authorization-request` messages on a host runtime unless the request `viewerPeerId` matches an accepted opposite-role viewer peer observed through inbound `hello`, before emitting local `received` protocol events or running host authorization workflow handling.

#### Scenario: Unbound host authorization request is ignored
- **WHEN** a host shell receives a decoded same-session `session-authorization-request`
- **AND** the host has not accepted an opposite-role viewer `hello`
- **THEN** the shell MUST NOT emit a local `received` protocol event for that ignored request
- **AND** the shell MUST NOT send authorization decisions, authorization states, or audit events because of that request

#### Scenario: Mismatched host authorization request is ignored
- **WHEN** a host shell has accepted an opposite-role viewer `hello` for viewer peer `viewer-1`
- **AND** the host receives a decoded same-session `session-authorization-request` whose `viewerPeerId` is a different viewer peer id
- **THEN** the shell MUST NOT emit a local `received` protocol event for that ignored request
- **AND** the shell MUST NOT send authorization decisions, authorization states, or audit events because of that request

#### Scenario: Bound host authorization request remains valid
- **WHEN** a host shell has accepted an opposite-role viewer `hello` for viewer peer `viewer-1`
- **AND** the host receives a decoded same-session `session-authorization-request` whose `viewerPeerId` is `viewer-1`
- **THEN** the normal explicit host-decision workflow MAY handle that request

#### Scenario: Ignored host authorization request input remains secret-safe
- **WHEN** the shell ignores a host authorization request because no matching viewer peer has been observed
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, permission scopes, tokens, pairing codes, private reasons, signal payloads, keystrokes, screenshots, screen contents, or input contents

### Requirement: Explicit host decision
The host shell SHALL NOT approve or deny authorization requests unless an explicit valid host decision is configured, and the managed runtime SHALL reject malformed host decision values before starting a relay connection or sending authorization decisions.

#### Scenario: Host decision omitted
- **WHEN** the host shell receives an authorization request and no host decision is configured
- **THEN** it logs the request without sending an approval or denial

#### Scenario: Host approves request
- **WHEN** the host shell receives an authorization request and is explicitly configured to approve with visible session state
- **THEN** it sends an approved decision and active visible state update

#### Scenario: Malformed runtime host decision is rejected
- **WHEN** the managed runtime is configured with a host decision outside `none`, `approve`, or `deny`
- **THEN** it fails before connecting to the relay or sending any authorization decision

### Requirement: Visible active state gate
The host shell MUST NOT emit active session state unless visible session state is explicitly configured.

#### Scenario: Host approves without visible session flag
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it sends no active state update

### Requirement: Host permission revoke simulation
The host shell SHALL send permission revocation messages only when revocation is explicitly configured, the host has already emitted an active visible session state for the same authorization, and the authorization is still unexpired when the revoke delay fires. Host-generated revocation simulation MUST emit a bound `session-control` with action `revoke-permission` before the `permission-revoked` notification and follow-up authorization state.

#### Scenario: Host revokes granted permission after visible activation
- **WHEN** the host shell is explicitly configured to approve, visible session state is true, and a revoke delay and permission are configured
- **THEN** it sends an approved decision, sends active visible state, sends `session-control` with action `revoke-permission`, the active authorization id, and the configured permission after the delay, sends `permission-revoked` for the configured permission, and sends an updated authorization state without that permission

#### Scenario: Host revokes final granted permission
- **WHEN** the configured revoked permission is the only granted permission
- **THEN** the updated authorization state has status `revoked` and an empty permission list

#### Scenario: Revoke configured without visible activation
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it does not send revoke `session-control`, `permission-revoked`, active, or revoked state updates

#### Scenario: Expiration suppresses delayed revoke
- **WHEN** a revoke delay is configured but the authorization reaches its expiration time before the revoke timer can send
- **THEN** the host shell sends the expired state and expiration audit, and does not send revoke `session-control`, `permission-revoked`, revoked state, or revocation audit for that expired authorization

#### Scenario: Revoke simulation safety boundary
- **WHEN** the host shell sends revoke simulation messages
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, or hide the session from the host

#### Scenario: Revoke simulation logging safety boundary
- **WHEN** the agent shell logs received protocol or non-protocol messages during revoke simulation
- **THEN** it MUST log only message summaries and MUST NOT log raw protocol payloads, raw non-protocol text, raw tokens, raw pairing codes, credentials, keystrokes, screenshots, or screen contents

### Requirement: Host workflow audit-event simulation
The host shell SHALL emit secret-safe development `audit-event` protocol messages for explicit host authorization decisions, visible activation, and permission revocation simulation.

#### Scenario: Host approval audit event
- **WHEN** the host shell explicitly approves an authorization request
- **THEN** it sends an `audit-event` with accepted outcome and safe approval metadata

#### Scenario: Host denial audit event
- **WHEN** the host shell explicitly denies an authorization request
- **THEN** it sends an `audit-event` with denied outcome and safe denial metadata

#### Scenario: Visible activation audit event
- **WHEN** the host shell emits active visible session state
- **THEN** it sends an `audit-event` with accepted outcome and visible host metadata

#### Scenario: Permission revoke audit event
- **WHEN** the host shell sends a configured permission revocation
- **THEN** it sends an `audit-event` with accepted outcome, revoked permission identifier, and remaining permission count

#### Scenario: Agent shell audit-event details are secret-safe
- **WHEN** the host shell sends development audit-event messages
- **THEN** audit details MUST NOT contain raw tokens, raw pairing codes, credentials, display names, signal payloads, keystrokes, screenshots, screen contents, or raw denial/revocation reason text

### Requirement: Host session terminate simulation
The host shell SHALL send session termination simulation messages only when termination is explicitly configured, the host has already emitted an active visible session state for the same authorization, and the authorization is still unexpired when the terminate delay fires. Host-generated terminate `session-control` messages MUST include the authorization id of the visible active or paused session being controlled.

#### Scenario: Host terminates after visible activation
- **WHEN** the host shell is explicitly configured to approve, visible session state is true, and a terminate delay is configured
- **THEN** it sends an approved decision, sends active visible state, sends `session-control` with action `terminate` and the active authorization id after the delay, sends `session-authorization-state` with status `terminated`, and sends a secret-safe termination `audit-event`

#### Scenario: Terminate configured without visible activation
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it does not send terminate `session-control` and does not send active or terminated state updates

#### Scenario: Termination suppresses later revoke simulation
- **WHEN** termination and permission revocation are both configured and termination is sent first
- **THEN** the host shell does not send later revocation messages for the terminated authorization

#### Scenario: Expiration suppresses delayed termination
- **WHEN** a terminate delay is configured but the authorization reaches its expiration time before the terminate timer can send
- **THEN** the host shell sends the expired state and expiration audit, and does not send terminate `session-control`, terminated state, or termination audit for that expired authorization

#### Scenario: Terminate simulation safety boundary
- **WHEN** the host shell sends termination simulation messages
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, or hide the session from the host

#### Scenario: Terminate audit details are secret-safe
- **WHEN** the host shell sends a termination audit-event
- **THEN** audit details MUST NOT contain raw tokens, raw pairing codes, credentials, display names, signal payloads, keystrokes, screenshots, screen contents, or raw termination reason text

### Requirement: Host authorization expiration simulation
The host shell SHALL simulate authorization expiration only after an explicitly approved authorization has emitted active visible session state.

#### Scenario: Host authorization expires after visible activation
- **WHEN** the host shell is explicitly configured to approve, visible session state is true, and the configured authorization TTL elapses
- **THEN** it sends `session-authorization-state` with status `expired`, empty permissions, and a secret-safe expiration `audit-event`

#### Scenario: Expiration configured without visible activation
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it does not send active or expired state updates

#### Scenario: Terminal state suppresses expiration
- **WHEN** authorization expiration is scheduled and the authorization is revoked or terminated before the TTL elapses
- **THEN** the host shell does not send a later expired state update for the same authorization

#### Scenario: Expiration audit details are secret-safe
- **WHEN** the host shell sends an expiration audit-event
- **THEN** audit details MUST NOT contain raw tokens, raw pairing codes, credentials, display names, signal payloads, keystrokes, screenshots, screen contents, or raw protocol payloads

#### Scenario: Expiration simulation safety boundary
- **WHEN** the host shell sends expiration simulation messages
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, or hide the session from the host

### Requirement: Host pause and resume simulation
The host shell SHALL send pause and resume simulation messages only when they are explicitly configured and the host has already emitted an active visible session state for the same authorization. Host-generated pause and resume `session-control` messages MUST include the authorization id of the visible active session being controlled.

#### Scenario: Host pauses after visible activation
- **WHEN** the host shell is explicitly configured to approve, visible session state is true, and a pause delay is configured
- **THEN** it sends an approved decision, sends active visible state, sends `session-control` with action `pause` and the active authorization id after the delay, sends `session-authorization-state` with status `paused`, and sends a secret-safe pause `audit-event`

#### Scenario: Host resumes after pause
- **WHEN** the host shell has paused an authorization and a resume delay is configured
- **THEN** it sends `session-control` with action `resume` and the paused authorization id, sends `session-authorization-state` with status `active`, and sends a secret-safe resume `audit-event`

#### Scenario: Pause configured without visible activation
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it does not send pause or resume `session-control` messages and does not send paused state updates

#### Scenario: Terminal state suppresses pause and resume
- **WHEN** pause or resume is scheduled and the authorization is revoked, terminated, or expired first
- **THEN** the host shell does not send later pause or resume messages for the same authorization

#### Scenario: Pause and resume audit details are secret-safe
- **WHEN** the host shell sends pause or resume audit-events
- **THEN** audit details MUST NOT contain raw tokens, raw pairing codes, credentials, display names, signal payloads, keystrokes, screenshots, screen contents, or raw pause/resume reason text

#### Scenario: Pause and resume simulation safety boundary
- **WHEN** the host shell sends pause or resume simulation messages
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, or hide the session from the host

### Requirement: Host workflow audit file persistence
The host shell SHALL persist local development audit records for host-generated workflow `audit-event` messages when an audit sink is configured. When an audit sink is configured, the host shell MUST successfully write the matching local audit record before sending the associated host authorization decision, authorization state, permission revoke, session control, or protocol `audit-event` message for that audited workflow action.

#### Scenario: Host approval audit is persisted
- **WHEN** the host shell is configured with an audit sink and explicitly approves a visible authorization request
- **THEN** it writes schema-valid audit records for approval and visible activation using the host actor, session id, action, outcome, and secret-safe detail metadata

#### Scenario: Host denial audit is persisted
- **WHEN** the host shell is configured with an audit sink and explicitly denies an authorization request
- **THEN** it writes a schema-valid denied audit record without raw denial reason text

#### Scenario: Host lifecycle audit is persisted
- **WHEN** the host shell emits revocation, pause, resume, termination, or expiration workflow audit-events
- **THEN** it writes matching schema-valid audit records with the same event ids, actions, outcomes, and secret-safe details

#### Scenario: Agent shell audit file details are secret-safe
- **WHEN** host workflow audit records are persisted with private host display-name, viewer display-name, lifecycle-reason, pairing-code, signal-payload, or protocol-payload marker values present elsewhere in the workflow
- **THEN** persisted details MUST NOT contain raw tokens, raw pairing codes, credentials, display names, signal payloads, raw protocol payloads, keystrokes, screenshots, screen contents, or raw private reason text

#### Scenario: Received protocol payloads are not persisted as workflow audit
- **WHEN** the agent shell receives arbitrary protocol messages or non-protocol text
- **THEN** it does not persist those raw payloads through the host workflow audit sink

#### Scenario: Audit sink failure is surfaced
- **WHEN** the configured host workflow audit sink fails to write a record
- **THEN** the host shell surfaces the failure instead of silently dropping the audit record

#### Scenario: Denial is not sent when denial audit persistence fails
- **WHEN** the host shell is configured with an audit sink, explicitly denies an authorization request, and the matching audit write fails
- **THEN** it MUST surface the sanitized runtime failure before sending the denial decision or denial audit-event

#### Scenario: Lifecycle update is not sent when lifecycle audit persistence fails
- **WHEN** the host shell is configured with an audit sink and a delayed revocation, pause, resume, termination, or expiration audit write fails
- **THEN** it MUST surface the sanitized runtime failure before sending the associated permission revoke, session control, authorization state, or lifecycle audit-event message

### Requirement: Inbound self-disconnect boundary
The agent shell SHALL ignore decoded inbound `peer-disconnected` messages whose `peerId` equals the local runtime peer before emitting local `received` protocol events or recording remote peer disconnected state.

#### Scenario: Self-disconnect notice is ignored
- **WHEN** a host shell receives a decoded `peer-disconnected` message whose `peerId` equals the local host peer id
- **THEN** the shell MUST NOT record remote peer disconnected state because of that message
- **AND** the shell MUST NOT emit a local `received` protocol event for that ignored message

#### Scenario: Ignored self-disconnect input remains secret-safe
- **WHEN** the shell ignores a decoded `peer-disconnected` message that identifies the local peer
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, tokens, pairing codes, private reasons, signal payloads, keystrokes, screenshots, screen contents, or input contents

### Requirement: Peer disconnect state handling
The agent shell SHALL treat a received `peer-disconnected` message as remote peer disconnected state for the current development session. After recording this state, the managed runtime MUST fail closed for delayed workflow sends and direct public runtime sends to that disconnected peer.

#### Scenario: Viewer receives host disconnect notice
- **WHEN** the host peer disconnects while a viewer shell remains connected through the relay
- **THEN** the viewer shell receives and records the `peer-disconnected` protocol message without starting capture, sending input, reconnecting, or granting permissions

#### Scenario: Host suppresses delayed workflow after viewer disconnect
- **WHEN** the host shell has delayed workflow simulation scheduled and receives `peer-disconnected` for the viewer
- **THEN** the host shell MUST NOT send later revoke, pause, resume, termination, expiration, authorization state, session control, permission revoke, or workflow audit-event messages for that disconnected peer

#### Scenario: Direct runtime send is blocked after peer disconnect
- **WHEN** the agent shell records remote peer disconnected state
- **AND** caller code invokes the public managed runtime `send()` method
- **THEN** the send MUST fail before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked message

#### Scenario: Disconnect summary logging is secret-safe
- **WHEN** the agent shell logs a received peer disconnect notice
- **THEN** the log MAY include peer id, peer role, message id, and bounded reason code, and MUST NOT include raw tokens, raw pairing codes, credentials, raw protocol payloads, keystrokes, screenshots, screen contents, or full secrets

#### Scenario: Disconnect state is not authorization
- **WHEN** the agent shell records remote peer disconnect state
- **THEN** the state MUST NOT approve authorization, activate a visible session, grant permissions, start capture, send input, reconnect the peer, suppress host visibility, or bypass consent workflows

### Requirement: Host disconnect simulation
The host shell SHALL close its local relay connection after visible activation only when disconnect simulation is explicitly configured. The disconnect simulation MUST NOT send peer-originated `peer-disconnected` protocol messages; disconnect notices remain relay-originated.

#### Scenario: Host disconnects after visible activation
- **WHEN** the host shell is explicitly configured to approve, visible session state is true, and a disconnect delay is configured
- **THEN** it sends an approved decision, sends active visible state, closes the host WebSocket after the delay, and the viewer receives a relay-originated `peer-disconnected` notice

#### Scenario: Disconnect configured without visible activation
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it does not close the host WebSocket because of disconnect simulation

#### Scenario: Disconnect suppresses later host workflow
- **WHEN** disconnect simulation fires before delayed revoke, pause, resume, termination, or expiration simulation
- **THEN** the host shell MUST NOT send later authorization state, session control, permission revoke, or workflow audit-event messages for that disconnected connection

#### Scenario: Disconnect simulation safety boundary
- **WHEN** the host shell runs disconnect simulation
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide the session, send forged disconnect notices, or bypass consent workflows

### Requirement: Revoke control confirmation handling
The viewer runtime SHALL accept same-authority `permission-revoked` confirmation messages for the same authorization after a bound revoke-permission `session-control` has already removed the permission locally. This confirmation MUST NOT restore permissions or authorize sensitive actions.

#### Scenario: Viewer accepts revoke notification after revoke control
- **WHEN** a viewer runtime has active visible authorization for `screen:view`
- **AND** it receives a bound revoke-permission `session-control` for `screen:view`
- **AND** it later receives `permission-revoked` from the same host authority for the same authorization id and permission
- **THEN** the viewer runtime MAY emit the received `permission-revoked` event as a confirmation
- **AND** viewer-originated `signal` sends MUST remain rejected before socket write and local `sent` event emission

#### Scenario: Revoke confirmation remains secret-safe
- **WHEN** the viewer runtime receives the follow-up `permission-revoked` confirmation after a revoke control
- **THEN** local events MAY preserve the message type and consent workflow metadata needed to correlate the confirmation
- **AND** local events and logs MUST NOT expose raw protocol payloads, tokens, pairing codes, private reasons, keystrokes, screenshots, screen contents, or input contents

### Requirement: Host visible-session indicator events
The host agent shell SHALL emit local secret-safe indicator events for visible host session state changes. Indicator events are local UI metadata only and MUST NOT authorize screen capture, input, clipboard access, file transfer, diagnostics, reconnect, hidden sessions, or consent bypass.

#### Scenario: Indicator activates after visible approval
- **WHEN** a host shell explicitly approves an authorization request and emits an active visible session state
- **THEN** it MUST emit a local indicator event with state `active`, the authorization id, authorization status `active`, `visibleToHost: true`, and the granted permission count
- **AND** the indicator event MUST NOT be emitted before explicit approval and visible activation

#### Scenario: Indicator is withheld without visible activation
- **WHEN** a host shell approves an authorization request but visible session state is false
- **THEN** it MUST NOT emit an active or paused indicator event

#### Scenario: Indicator follows pause, resume, and partial revocation
- **WHEN** a host shell has emitted an active indicator for a visible authorization
- **AND** the host workflow pauses, resumes, or revokes one permission while remaining non-terminal
- **THEN** it MUST emit a local indicator update that reflects the current active or paused state and current permission count

#### Scenario: Indicator deactivates on terminal or disconnect lifecycle
- **WHEN** a host shell has emitted an active or paused indicator for a visible authorization
- **AND** the host workflow reaches final revocation, termination, expiration, local disconnect, runtime stop, local socket close, or trusted remote peer disconnect
- **THEN** it MUST emit a local indicator event with state `inactive`

#### Scenario: Indicator diagnostics are secret-safe
- **WHEN** the runtime emits or logs host indicator updates
- **THEN** indicator events and logs MAY include bounded lifecycle metadata such as authorization id, authorization status, indicator state, visible flag, permission count, and cause
- **AND** they MUST NOT expose raw protocol payloads, tokens, pairing codes, private reasons, display names, signal payloads, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents, diagnostics dumps, or input contents

### Requirement: Signal authorization-id binding
The agent shell SHALL bind outbound and inbound `signal` messages to the current active visible authorization by requiring a payload authorization id that matches the runtime's active authorization snapshot. This binding is a consent-safety gate only and MUST NOT authorize screen capture, input, clipboard access, file transfer, diagnostics, reconnect, hidden sessions, or consent bypass.

#### Scenario: Outbound signal without authorization id is blocked
- **WHEN** a host or viewer runtime has active visible `screen:view` authorization and caller code invokes public `send()` with a `signal` whose payload omits `authorizationId`
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked signal

#### Scenario: Outbound signal with mismatched authorization id is blocked
- **WHEN** a host or viewer runtime has active visible `screen:view` authorization and caller code invokes public `send()` with a `signal` whose payload `authorizationId` does not match the active authorization id
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked signal

#### Scenario: Outbound signal with matching authorization id is allowed
- **WHEN** a host or viewer runtime has active visible `screen:view` authorization and caller code invokes public `send()` with a `signal` whose routing metadata and payload `authorizationId` match the active authorization
- **THEN** the signal MAY be written to the socket
- **AND** the local `sent` event MUST continue to redact raw signal payload contents

#### Scenario: Inbound signal without matching authorization id is ignored
- **WHEN** a host or viewer runtime receives a routed `signal` whose payload omits `authorizationId` or carries an authorization id that does not match the runtime's active authorization
- **THEN** the runtime MUST ignore the signal before local `received` event emission and before received signal summary logging

#### Scenario: Inbound signal with matching authorization id is received
- **WHEN** a host or viewer runtime has active visible `screen:view` authorization and receives a routed `signal` whose payload `authorizationId` matches the active authorization id
- **THEN** the runtime MAY emit a local `received` event for that signal
- **AND** the received event MUST continue to redact raw signal payload contents

#### Scenario: Signal authorization binding diagnostics are secret-safe
- **WHEN** the runtime blocks or ignores a `signal` because its payload authorization id is missing, malformed, or mismatched
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw signal payloads, signal payload keys, tokens, pairing codes, authorization reasons, display names, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents, diagnostics dumps, or input contents

### Requirement: Agent signal payload JSON compatibility
The agent shell SHALL inherit shared protocol `signal.payload` JSON-compatible object validation for public runtime sends and inbound messages. This validation MUST NOT weaken existing signal authorization, routing, redaction, or consent gates.

#### Scenario: Public send rejects non-JSON signal payload
- **WHEN** caller code invokes public runtime `send()` with a `signal` payload containing a non-JSON value or property shape
- **THEN** the runtime rejects the send before socket write and before local `sent` event emission

#### Scenario: Inbound non-JSON signal payload is not trusted
- **WHEN** the agent shell receives a decoded `signal` message whose payload contains a non-JSON value or property shape
- **THEN** shared protocol validation rejects the message before local `received` protocol event emission or received signal summary logging

#### Scenario: Signal JSON validation does not grant access
- **WHEN** a `signal` payload is JSON-compatible
- **THEN** JSON compatibility alone MUST NOT authorize screen capture, input, clipboard access, file transfer, diagnostics, reconnect, hidden sessions, or consent bypass

### Requirement: Agent shell rejects unknown fixed protocol fields
The agent shell SHALL treat inbound and public-send protocol messages with unknown fixed-shape fields as invalid protocol input before trusted runtime events, workflow handling, socket writes, or local sent-event emission.

#### Scenario: Inbound message has unknown fixed field
- **WHEN** the agent shell receives a protocol message with an unknown top-level field outside allowed metadata containers
- **THEN** the runtime MUST reject it before local `received` protocol event emission or workflow handling

#### Scenario: Public send message has unknown fixed field
- **WHEN** caller code invokes public runtime `send()` with a protocol envelope that includes an unknown top-level field outside allowed metadata containers
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked envelope

#### Scenario: Agent shell strict-field diagnostics are secret-safe
- **WHEN** the runtime rejects or ignores a message because of an unknown fixed field
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw protocol payloads, unknown field values, tokens, pairing codes, private reasons, keystrokes, screenshots, screen contents, or input contents
