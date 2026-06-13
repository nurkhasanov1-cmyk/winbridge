## MODIFIED Requirements

### Requirement: Host pause and resume simulation
The host shell SHALL send pause and resume messages only when delayed simulation is explicitly configured or direct local host pause/resume control is invoked. Host pause control MUST be available only to host runtimes with visible active unexpired authorization. Host resume control MUST be available only to host runtimes with visible paused unexpired authorization. Host-generated pause and resume `session-control` messages MUST include the authorization id of the visible session being controlled.

#### Scenario: Host pauses after visible activation
- **WHEN** the host shell is explicitly configured to approve, visible session state is true, and a pause delay is configured
- **THEN** it sends an approved decision, sends active visible state, sends `session-control` with action `pause` and the active authorization id after the delay, sends `session-authorization-state` with status `paused`, and sends a secret-safe pause `audit-event`

#### Scenario: Host resumes after pause
- **WHEN** the host shell has paused an authorization and a resume delay is configured
- **THEN** it sends `session-control` with action `resume` and the paused authorization id, sends `session-authorization-state` with status `active`, and sends a secret-safe resume `audit-event`

#### Scenario: Direct host pause pauses a visible active session
- **WHEN** host runtime code invokes local pause control after visible active authorization
- **THEN** it sends `session-control` with action `pause`, sends `session-authorization-state` with status `paused`, emits a paused local host indicator, and sends a secret-safe pause `audit-event`

#### Scenario: Direct host resume resumes a visible paused session
- **WHEN** host runtime code invokes local resume control after visible paused authorization
- **THEN** it sends `session-control` with action `resume`, sends `session-authorization-state` with status `active`, emits an active local host indicator, and sends a secret-safe resume `audit-event`

#### Scenario: Direct host pause requires active visible authorization
- **WHEN** runtime code invokes local pause control before visible active host authorization
- **THEN** the runtime MUST reject the control before sending session-control, authorization-state, or audit-event messages

#### Scenario: Direct host resume requires paused visible authorization
- **WHEN** runtime code invokes local resume control before visible paused host authorization
- **THEN** the runtime MUST reject the control before sending session-control, authorization-state, or audit-event messages

#### Scenario: Direct host pause and resume are host-only
- **WHEN** viewer runtime code invokes local pause or resume control
- **THEN** the runtime MUST reject the control before sending session-control, authorization-state, or audit-event messages

#### Scenario: Pause configured without visible activation
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it does not send pause or resume `session-control` messages and does not send paused state updates

#### Scenario: Terminal state suppresses pause and resume
- **WHEN** pause or resume is scheduled or invoked and the authorization is revoked, terminated, expired, disconnected, or otherwise no longer active or paused visible
- **THEN** the host shell does not send later pause or resume messages for the same authorization

#### Scenario: Pause and resume audit details are secret-safe
- **WHEN** the host shell sends pause or resume audit-events
- **THEN** audit details MUST NOT contain raw tokens, raw pairing codes, credentials, display names, signal payloads, keystrokes, screenshots, screen contents, or raw pause/resume reason text

#### Scenario: Pause and resume simulation safety boundary
- **WHEN** the host shell sends pause or resume simulation messages or direct pause/resume control messages
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide the session from the host, or bypass consent workflows

### Requirement: Host workflow audit file persistence
The host shell SHALL persist local development audit records for host-generated workflow `audit-event` messages and host-local disconnect controls when an audit sink is configured. When an audit sink is configured, the host shell MUST successfully write the matching local audit record before sending the associated host authorization decision, authorization state, permission revoke, session control, or protocol `audit-event` message for that audited workflow action. Local host disconnect audit failures MUST be surfaced through sanitized runtime diagnostics but MUST NOT prevent host indicator deactivation or local WebSocket close.

#### Scenario: Host approval audit is persisted
- **WHEN** the host shell is configured with an audit sink and explicitly approves a visible authorization request
- **THEN** it writes schema-valid audit records for approval and visible activation using the host actor, session id, action, outcome, and secret-safe detail metadata

#### Scenario: Host denial audit is persisted
- **WHEN** the host shell is configured with an audit sink and explicitly denies an authorization request
- **THEN** it writes a schema-valid denied audit record without raw denial reason text

#### Scenario: Host lifecycle audit is persisted
- **WHEN** the host shell emits revocation, pause, resume, termination, or expiration workflow audit-events
- **THEN** it writes matching schema-valid audit records with the same event ids, actions, outcomes, and secret-safe details

#### Scenario: Host local disconnect audit is persisted
- **WHEN** the host shell closes a visible active or paused session through local disconnect simulation or direct local disconnect control
- **THEN** it writes a schema-valid `agent-shell.session.disconnected` audit record with accepted outcome, host actor, session id, cause `local-disconnect`, visible flag, and permission count

#### Scenario: Agent shell audit file details are secret-safe
- **WHEN** host workflow audit records are persisted with private host display-name, viewer display-name, lifecycle-reason, pairing-code, signal-payload, close-reason, or protocol-payload marker values present elsewhere in the workflow
- **THEN** persisted details MUST NOT contain raw tokens, raw pairing codes, credentials, display names, signal payloads, raw protocol payloads, keystrokes, screenshots, screen contents, raw close reason text, or raw private reason text

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
- **WHEN** the host shell is configured with an audit sink and a delayed or direct revocation, pause, resume, termination, or expiration audit write fails
- **THEN** it MUST surface the sanitized runtime failure before sending the associated permission revoke, session control, authorization state, or lifecycle audit-event message

#### Scenario: Local disconnect proceeds when disconnect audit persistence fails
- **WHEN** the host shell is configured with an audit sink and a local disconnect audit write fails
- **THEN** it MUST surface the sanitized runtime failure
- **AND** it MUST still emit an inactive local host indicator and close the local WebSocket without sending peer-originated `peer-disconnected`
