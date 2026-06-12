# agent-shell-consent-workflow Specification

## Purpose
Defines the non-native agent shell workflow for exercising consent, visible activation, and revocation protocol behavior without implementing remote actions.
## Requirements
### Requirement: Managed agent shell lifecycle
The agent shell SHALL expose a managed runtime with explicit start and stop operations for tests and CLI use. It SHALL send `join-session` when the socket opens. It SHALL send `hello` only after the relay indicates a two-peer room or after receiving a peer `hello`, and MUST NOT send `hello` before a relay recipient is available.

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
- **WHEN** the relay returns `relay-ready` with room size 2 or the shell receives a peer `hello`
- **THEN** it sends exactly one `hello` for its local peer before later workflow messages that depend on peer presence
- **AND** sending `hello` MUST NOT approve authorization, activate a visible session, grant permissions, start capture, send input, reconnect a peer, suppress host visibility, or bypass consent workflows

### Requirement: Managed runtime option validation
The managed agent shell runtime SHALL reject malformed direct runtime options before opening a relay connection, sending protocol messages, scheduling workflow timers, or emitting authorization decisions. Relay URLs MUST NOT contain embedded credentials/userinfo, and relay shared-token values MUST be supplied through the dedicated token field rather than embedded in the relay URL query string. Runtime token values MUST be non-blank, 1024 UTF-8 bytes or less, and contain no ASCII control characters.

#### Scenario: Runtime relay URL is not WebSocket
- **WHEN** the managed runtime is configured with a malformed, relative, or non-WebSocket relay URL
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime relay URL carries credentials
- **WHEN** the managed runtime is configured with a relay URL containing username or password/userinfo credentials
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime relay URL carries token query
- **WHEN** the managed runtime is configured with a relay URL containing a `token` query parameter
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime identity fields are malformed
- **WHEN** the managed runtime is configured with a malformed role, session id, pairing code, peer id, device id, or display name
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime requested permissions are malformed
- **WHEN** the managed runtime is configured with invalid, duplicate, or oversized requested permissions
- **THEN** it fails before connecting to the relay or sending a session authorization request

#### Scenario: Runtime token is malformed
- **WHEN** the managed runtime is configured with an empty, whitespace-only, non-string, control-character, or oversized token
- **THEN** it fails before connecting to the relay or adding the token to a relay URL

#### Scenario: Runtime workflow timer is unsafe
- **WHEN** the managed runtime is configured with a non-integer, negative, or oversized workflow timer delay
- **THEN** it fails before connecting to the relay or scheduling workflow timers

#### Scenario: Runtime visible-session flag is malformed
- **WHEN** the managed runtime is configured with a non-boolean visible-session flag
- **THEN** it fails before connecting to the relay or sending any authorization decision

#### Scenario: Runtime decision or lifecycle reason is malformed
- **WHEN** the managed runtime is configured with a blank or oversized decision or lifecycle reason
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime revoke permission is malformed
- **WHEN** the managed runtime is configured with an invalid revocation permission
- **THEN** it fails before connecting to the relay or scheduling permission revocation

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

### Requirement: Sent signal runtime events are secret-safe
The agent shell SHALL emit local `sent` runtime events for `signal` messages without exposing raw signal payload contents, tokens, pairing codes, credentials, parser details, protocol payload fragments, keystrokes, screenshots, screen contents, or input contents.

#### Scenario: Sent signal payload is redacted
- **WHEN** the managed runtime sends a valid `signal` protocol message
- **THEN** the local `sent` runtime event MUST identify the signal message and peer routing metadata but MUST NOT expose the raw signal payload contents

#### Scenario: Sent signal event keeps safe diagnostics
- **WHEN** the managed runtime emits a local `sent` event for a `signal` message
- **THEN** the event MAY expose secret-safe metadata such as original payload byte length

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

### Requirement: Received signal runtime events are secret-safe
The agent shell SHALL emit local `received` runtime events for `signal` messages without exposing raw signal payload contents, tokens, pairing codes, credentials, parser details, protocol payload fragments, keystrokes, screenshots, screen contents, or input contents.

#### Scenario: Received signal payload is redacted
- **WHEN** the managed runtime receives a valid `signal` protocol message
- **THEN** the local `received` runtime event MUST identify the signal message and peer routing metadata but MUST NOT expose the raw signal payload contents

#### Scenario: Received signal event keeps safe diagnostics
- **WHEN** the managed runtime emits a local `received` event for a `signal` message
- **THEN** the event MAY expose secret-safe metadata such as original payload byte length

### Requirement: Raw runtime events are secret-safe
The agent shell SHALL emit local `raw` runtime events without exposing raw non-protocol inbound text, parser details, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, or input contents.

#### Scenario: Non-protocol inbound text is redacted
- **WHEN** the managed runtime receives inbound text that cannot be decoded as a protocol envelope
- **THEN** the local `raw` runtime event MUST expose only secret-safe metadata such as byte length and MUST NOT expose the original text

#### Scenario: Relay parser details are not exposed
- **WHEN** the managed runtime receives a relay rejection or other malformed inbound text that includes parser details or raw payload fragments
- **THEN** the local `raw` runtime event MUST NOT expose those details or fragments

### Requirement: Closed runtime events are secret-safe
The agent shell SHALL emit local `closed` runtime events without exposing raw WebSocket close reasons, tokens, pairing codes, credentials, parser details, protocol payload fragments, keystrokes, screenshots, screen contents, or input contents.

#### Scenario: WebSocket close reason is redacted
- **WHEN** the managed runtime receives a WebSocket close frame with a reason
- **THEN** the local `closed` runtime event MUST expose only secret-safe metadata such as close code and reason byte length and MUST NOT expose the raw reason text

#### Scenario: Disconnect log remains summary-only
- **WHEN** the managed runtime logs a WebSocket disconnect
- **THEN** the log MUST include only summary metadata and MUST NOT include the raw close reason text

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
The agent shell SHALL reject malformed, unknown, or ambiguous CLI arguments before starting the runtime, including duplicate requested permissions. Relay URLs MUST NOT contain embedded credentials/userinfo, and relay shared-token values MUST be supplied through `--token` rather than embedded in `--relay` URLs. CLI token values MUST be non-blank, 1024 UTF-8 bytes or less, and contain no ASCII control characters.

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
- **WHEN** the agent shell is started with an empty, whitespace-only, or oversized `--name` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Malformed token option is rejected
- **WHEN** the agent shell is started with an empty, whitespace-only, control-character, or oversized `--token` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Oversized workflow timer option is rejected
- **WHEN** the agent shell is started with `--authorization-ttl-ms`, `--revoke-after-ms`, `--pause-after-ms`, `--resume-after-ms`, or `--terminate-after-ms` above the safe timer delay bound
- **THEN** it exits through bounded usage handling before connecting to the relay or scheduling workflow timers

#### Scenario: Invalid lifecycle reason option is rejected
- **WHEN** the agent shell is started with a blank or oversized lifecycle reason option
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Blank audit log path option is rejected
- **WHEN** the agent shell is started with an empty or whitespace-only `--audit-log` value
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Valid omitted options keep safe defaults
- **WHEN** the agent shell is started with only a valid role
- **THEN** omitted consent-sensitive options keep fail-closed defaults such as no requested permissions, no host decision, and no visible session

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
The host shell SHALL send permission revocation messages only when revocation is explicitly configured, the host has already emitted an active visible session state for the same authorization, and the authorization is still unexpired when the revoke delay fires.

#### Scenario: Host revokes granted permission after visible activation
- **WHEN** the host shell is explicitly configured to approve, visible session state is true, and a revoke delay and permission are configured
- **THEN** it sends an approved decision, sends active visible state, sends `permission-revoked` for the configured permission after the delay, and sends an updated authorization state without that permission

#### Scenario: Host revokes final granted permission
- **WHEN** the configured revoked permission is the only granted permission
- **THEN** the updated authorization state has status `revoked` and an empty permission list

#### Scenario: Revoke configured without visible activation
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it does not send `permission-revoked` and does not send an active or revoked state update

#### Scenario: Expiration suppresses delayed revoke
- **WHEN** a revoke delay is configured but the authorization reaches its expiration time before the revoke timer can send
- **THEN** the host shell sends the expired state and expiration audit, and does not send `permission-revoked`, revoked state, or revocation audit for that expired authorization

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
The host shell SHALL send session termination simulation messages only when termination is explicitly configured, the host has already emitted an active visible session state for the same authorization, and the authorization is still unexpired when the terminate delay fires.

#### Scenario: Host terminates after visible activation
- **WHEN** the host shell is explicitly configured to approve, visible session state is true, and a terminate delay is configured
- **THEN** it sends an approved decision, sends active visible state, sends `session-control` with action `terminate` after the delay, sends `session-authorization-state` with status `terminated`, and sends a secret-safe termination `audit-event`

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
The host shell SHALL send pause and resume simulation messages only when they are explicitly configured and the host has already emitted an active visible session state for the same authorization.

#### Scenario: Host pauses after visible activation
- **WHEN** the host shell is explicitly configured to approve, visible session state is true, and a pause delay is configured
- **THEN** it sends an approved decision, sends active visible state, sends `session-control` with action `pause` after the delay, sends `session-authorization-state` with status `paused`, and sends a secret-safe pause `audit-event`

#### Scenario: Host resumes after pause
- **WHEN** the host shell has paused an authorization and a resume delay is configured
- **THEN** it sends `session-control` with action `resume`, sends `session-authorization-state` with status `active`, and sends a secret-safe resume `audit-event`

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
The host shell SHALL persist local development audit records for host-generated workflow `audit-event` messages when an audit sink is configured.

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
