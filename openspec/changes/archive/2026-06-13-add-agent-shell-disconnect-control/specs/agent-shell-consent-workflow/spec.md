## MODIFIED Requirements

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
- **WHEN** the host shell is configured with an audit sink and a delayed revocation, pause, resume, termination, or expiration audit write fails
- **THEN** it MUST surface the sanitized runtime failure before sending the associated permission revoke, session control, authorization state, or lifecycle audit-event message

#### Scenario: Local disconnect proceeds when disconnect audit persistence fails
- **WHEN** the host shell is configured with an audit sink and a local disconnect audit write fails
- **THEN** it MUST surface the sanitized runtime failure
- **AND** it MUST still emit an inactive local host indicator and close the local WebSocket without sending peer-originated `peer-disconnected`

### Requirement: Host disconnect simulation
The host shell SHALL close its local relay connection after visible activation only when disconnect simulation is explicitly configured or direct local disconnect control is invoked. Local host disconnect control MUST be available only to host runtimes with visible active or paused authorization. Local host disconnect MUST deactivate the local host indicator, close the local WebSocket, and MUST NOT send peer-originated `peer-disconnected` protocol messages; disconnect notices remain relay-originated.

#### Scenario: Host disconnects after visible activation
- **WHEN** the host shell is explicitly configured to approve, visible session state is true, and a disconnect delay is configured
- **THEN** it sends an approved decision, sends active visible state, closes the host WebSocket after the delay, and the viewer receives a relay-originated `peer-disconnected` notice

#### Scenario: Direct host disconnect closes a visible session
- **WHEN** host runtime code invokes local disconnect control after visible active or paused authorization
- **THEN** it emits an inactive local host indicator, closes the host WebSocket, and the viewer receives a relay-originated `peer-disconnected` notice

#### Scenario: Direct host disconnect requires visible activation
- **WHEN** runtime code invokes local disconnect control before visible active or paused host authorization
- **THEN** the runtime MUST reject the control before closing the WebSocket or emitting disconnect audit

#### Scenario: Direct host disconnect is host-only
- **WHEN** viewer runtime code invokes local disconnect control
- **THEN** the runtime MUST reject the control before closing the WebSocket or emitting disconnect audit

#### Scenario: Disconnect configured without visible activation
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it does not close the host WebSocket because of disconnect simulation

#### Scenario: Disconnect suppresses later host workflow
- **WHEN** disconnect simulation or direct local disconnect control fires before delayed revoke, pause, resume, termination, or expiration simulation
- **THEN** the host shell MUST NOT send later authorization state, session control, permission revoke, or workflow audit-event messages for that disconnected connection

#### Scenario: Disconnect simulation safety boundary
- **WHEN** the host shell runs disconnect simulation or direct local disconnect control
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide the session, send forged disconnect notices, or bypass consent workflows
