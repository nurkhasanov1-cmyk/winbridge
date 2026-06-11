# agent-shell-consent-workflow Specification

## Purpose
Defines the non-native agent shell workflow for exercising consent, visible activation, and revocation protocol behavior without implementing remote actions.
## Requirements
### Requirement: Managed agent shell lifecycle
The agent shell SHALL expose a managed runtime with explicit start and stop operations for tests and CLI use.

#### Scenario: Agent shell starts
- **WHEN** the agent shell runtime starts
- **THEN** it connects to the relay, sends a join message, and sends hello using the same implementation as the CLI

### Requirement: Agent shell CLI argument validation
The agent shell SHALL reject malformed, unknown, or ambiguous CLI arguments before starting the runtime.

#### Scenario: Unknown CLI option is rejected
- **WHEN** the agent shell is started with an option name that is not part of the documented CLI
- **THEN** it exits through bounded usage handling before connecting to the relay

#### Scenario: Visible session value is explicit
- **WHEN** the agent shell is started with `--visible-session`
- **THEN** the value MUST be either `true` or `false`

#### Scenario: Invalid permission option is rejected
- **WHEN** the agent shell is started with an invalid requested or revocation permission value
- **THEN** it exits through bounded usage handling before sending any protocol message

#### Scenario: Invalid identifier option is rejected
- **WHEN** the agent shell is started with a malformed `--session`, `--peer`, or `--device` identifier
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Valid omitted options keep safe defaults
- **WHEN** the agent shell is started with only a valid role
- **THEN** omitted consent-sensitive options keep fail-closed defaults such as no requested permissions, no host decision, and no visible session

### Requirement: Viewer authorization request
The viewer shell SHALL send a session authorization request only when requested permissions are explicitly configured.

#### Scenario: Viewer requests screen view
- **WHEN** the viewer shell is started with requested `screen:view` permission
- **THEN** it sends a `session-authorization-request` message after joining the relay

### Requirement: Explicit host decision
The host shell SHALL NOT approve or deny authorization requests unless an explicit host decision is configured.

#### Scenario: Host decision omitted
- **WHEN** the host shell receives an authorization request and no host decision is configured
- **THEN** it logs the request without sending an approval or denial

#### Scenario: Host approves request
- **WHEN** the host shell receives an authorization request and is explicitly configured to approve with visible session state
- **THEN** it sends an approved decision and active visible state update

### Requirement: Visible active state gate
The host shell MUST NOT emit active session state unless visible session state is explicitly configured.

#### Scenario: Host approves without visible session flag
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it sends no active state update

### Requirement: Host permission revoke simulation
The host shell SHALL send permission revocation messages only when revocation is explicitly configured and the host has already emitted an active visible session state for the same authorization.

#### Scenario: Host revokes granted permission after visible activation
- **WHEN** the host shell is explicitly configured to approve, visible session state is true, and a revoke delay and permission are configured
- **THEN** it sends an approved decision, sends active visible state, sends `permission-revoked` for the configured permission after the delay, and sends an updated authorization state without that permission

#### Scenario: Host revokes final granted permission
- **WHEN** the configured revoked permission is the only granted permission
- **THEN** the updated authorization state has status `revoked` and an empty permission list

#### Scenario: Revoke configured without visible activation
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it does not send `permission-revoked` and does not send an active or revoked state update

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
The host shell SHALL send session termination simulation messages only when termination is explicitly configured and the host has already emitted an active visible session state for the same authorization.

#### Scenario: Host terminates after visible activation
- **WHEN** the host shell is explicitly configured to approve, visible session state is true, and a terminate delay is configured
- **THEN** it sends an approved decision, sends active visible state, sends `session-control` with action `terminate` after the delay, sends `session-authorization-state` with status `terminated`, and sends a secret-safe termination `audit-event`

#### Scenario: Terminate configured without visible activation
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it does not send terminate `session-control` and does not send active or terminated state updates

#### Scenario: Termination suppresses later revoke simulation
- **WHEN** termination and permission revocation are both configured and termination is sent first
- **THEN** the host shell does not send later revocation messages for the terminated authorization

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
- **WHEN** host workflow audit records are persisted
- **THEN** persisted details MUST NOT contain raw tokens, raw pairing codes, credentials, display names, signal payloads, raw protocol payloads, keystrokes, screenshots, screen contents, or raw private reason text

#### Scenario: Received protocol payloads are not persisted as workflow audit
- **WHEN** the agent shell receives arbitrary protocol messages or non-protocol text
- **THEN** it does not persist those raw payloads through the host workflow audit sink

#### Scenario: Audit sink failure is surfaced
- **WHEN** the configured host workflow audit sink fails to write a record
- **THEN** the host shell surfaces the failure instead of silently dropping the audit record

### Requirement: Peer disconnect state handling
The agent shell SHALL treat a received `peer-disconnected` message as remote peer disconnected state for the current development session.

#### Scenario: Viewer receives host disconnect notice
- **WHEN** the host peer disconnects while a viewer shell remains connected through the relay
- **THEN** the viewer shell receives and records the `peer-disconnected` protocol message without starting capture, sending input, reconnecting, or granting permissions

#### Scenario: Host suppresses delayed workflow after viewer disconnect
- **WHEN** the host shell has delayed workflow simulation scheduled and receives `peer-disconnected` for the viewer
- **THEN** the host shell MUST NOT send later revoke, pause, resume, termination, expiration, authorization state, session control, permission revoke, or workflow audit-event messages for that disconnected peer

#### Scenario: Disconnect summary logging is secret-safe
- **WHEN** the agent shell logs a received peer disconnect notice
- **THEN** the log MAY include peer id, peer role, message id, and bounded reason code, and MUST NOT include raw tokens, raw pairing codes, credentials, raw protocol payloads, keystrokes, screenshots, screen contents, or full secrets

#### Scenario: Disconnect state is not authorization
- **WHEN** the agent shell records remote peer disconnect state
- **THEN** the state MUST NOT approve authorization, activate a visible session, grant permissions, start capture, send input, reconnect the peer, suppress host visibility, or bypass consent workflows
