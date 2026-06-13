## MODIFIED Requirements

### Requirement: Host permission revoke simulation
The host shell SHALL send permission revocation messages only when delayed revocation is explicitly configured or direct local host revocation control is invoked. Host revocation control MUST be available only to host runtimes with visible active or paused unexpired authorization and a currently granted permission being revoked. Host-generated revocation MUST emit a bound `session-control` with action `revoke-permission` before the `permission-revoked` notification and follow-up authorization state.

#### Scenario: Host revokes granted permission after visible activation
- **WHEN** the host shell is explicitly configured to approve, visible session state is true, and a revoke delay and permission are configured
- **THEN** it sends an approved decision, sends active visible state, sends `session-control` with action `revoke-permission`, the active authorization id, and the configured permission after the delay, sends `permission-revoked` for the configured permission, and sends an updated authorization state without that permission

#### Scenario: Direct host revocation revokes a granted permission
- **WHEN** host runtime code invokes local revocation control for a currently granted permission after visible active authorization
- **THEN** it sends `session-control` with action `revoke-permission`, sends `permission-revoked`, sends an updated `session-authorization-state`, emits a local host indicator update, and sends a secret-safe revocation `audit-event`

#### Scenario: Direct host revocation works while paused
- **WHEN** host runtime code invokes local revocation control for a currently granted permission after visible paused authorization
- **THEN** it sends the same revocation protocol and audit sequence
- **AND** the updated authorization state remains `paused` when at least one permission remains

#### Scenario: Host revokes final granted permission
- **WHEN** the revoked permission is the only granted permission
- **THEN** the updated authorization state has status `revoked` and an empty permission list

#### Scenario: Direct host revocation requires active or paused visible authorization
- **WHEN** runtime code invokes local revocation control before visible active or paused host authorization
- **THEN** the runtime MUST reject the control before sending session-control, permission-revoked, authorization-state, or audit-event messages

#### Scenario: Direct host revocation requires a currently granted permission
- **WHEN** runtime code invokes local revocation control for a permission that is not currently granted
- **THEN** the runtime MUST reject the control before sending session-control, permission-revoked, authorization-state, or audit-event messages

#### Scenario: Direct host revocation is host-only
- **WHEN** viewer runtime code invokes local revocation control
- **THEN** the runtime MUST reject the control before sending session-control, permission-revoked, authorization-state, or audit-event messages

#### Scenario: Revoke configured without visible activation
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it does not send revoke `session-control`, `permission-revoked`, active, or revoked state updates

#### Scenario: Expiration suppresses delayed or direct revoke
- **WHEN** revocation is scheduled or invoked and the authorization reaches expiration first
- **THEN** the host shell sends the expired state and expiration audit, and does not send revoke `session-control`, `permission-revoked`, revoked state, or revocation audit for that expired authorization

#### Scenario: Revoke simulation safety boundary
- **WHEN** the host shell sends delayed or direct revoke messages
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide the session from the host, or bypass consent workflows

#### Scenario: Revoke diagnostics are secret-safe
- **WHEN** the agent shell logs received protocol or non-protocol messages during delayed or direct revoke workflow
- **THEN** logs MUST NOT expose raw protocol payloads, tokens, pairing codes, private reasons, display names, signal payloads, keystrokes, screenshots, screen contents, or input contents

### Requirement: Host workflow audit-event simulation
The host shell SHALL emit secret-safe development `audit-event` protocol messages for explicit host authorization decisions, visible activation, and delayed or direct permission revocation.

#### Scenario: Host approval audit event
- **WHEN** the host shell approves an authorization request
- **THEN** it sends an `audit-event` with accepted outcome and secret-safe granted permission count metadata

#### Scenario: Host denial audit event
- **WHEN** the host shell denies an authorization request
- **THEN** it sends an `audit-event` with denied outcome and secret-safe requested permission count metadata

#### Scenario: Visible activation audit event
- **WHEN** the host shell emits active visible session state
- **THEN** it sends an `audit-event` with accepted outcome and visible host metadata

#### Scenario: Permission revoke audit event
- **WHEN** the host shell sends a delayed or direct permission revocation
- **THEN** it sends an `audit-event` with accepted outcome, revoked permission identifier, and remaining permission count

#### Scenario: Agent shell audit-event details are secret-safe
- **WHEN** the host shell sends development audit-event messages
- **THEN** audit details MUST NOT contain raw tokens, raw pairing codes, credentials, display names, signal payloads, keystrokes, screenshots, screen contents, or raw denial/revocation reason text

### Requirement: Host workflow audit file persistence
The host shell SHALL persist local development audit records for host-generated workflow `audit-event` messages and host-local disconnect controls when an audit sink is configured. When an audit sink is configured, the host shell MUST successfully write the matching local audit record before sending the associated host authorization decision, authorization state, permission revoke, session control, or protocol `audit-event` message for that audited workflow action. Local host disconnect audit failures MUST be surfaced through sanitized runtime diagnostics but MUST NOT prevent host indicator deactivation or local WebSocket close.

#### Scenario: Host approval audit is persisted
- **WHEN** the host shell is configured with an audit sink and explicitly approves a visible authorization request
- **THEN** it writes schema-valid audit records for approval and visible activation using the host actor, session id, action, outcome, and secret-safe detail metadata

#### Scenario: Host denial audit is persisted
- **WHEN** the host shell is configured with an audit sink and explicitly denies an authorization request
- **THEN** it writes a schema-valid denied audit record without raw denial reason text

#### Scenario: Host lifecycle audit is persisted
- **WHEN** the host shell emits delayed or direct revocation, pause, resume, termination, or expiration workflow audit-events
- **THEN** it writes matching schema-valid audit records with the same event ids, actions, outcomes, and secret-safe details

#### Scenario: Host local disconnect audit is persisted
- **WHEN** the host shell closes a visible active or paused session through local disconnect simulation or direct local disconnect control
- **THEN** it writes a schema-valid `agent-shell.session.disconnected` audit record with accepted outcome, host actor, session id, cause `local-disconnect`, visible flag, and permission count

#### Scenario: Agent shell audit file details are secret-safe
- **WHEN** host workflow audit records are persisted with private host display-name, viewer display-name, lifecycle-reason, pairing-code, signal-payload, close-reason, or protocol-payload marker values present elsewhere in the workflow
- **THEN** persisted records MUST NOT include those raw values

#### Scenario: Received protocol payloads are not persisted as workflow audit
- **WHEN** the host shell receives protocol or non-protocol messages during a session
- **THEN** it does not persist those raw payloads through the host workflow audit sink

#### Scenario: Audit write failures are surfaced
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
- **THEN** it MUST surface a sanitized runtime failure
- **AND** it MUST still emit an inactive local host indicator and close the local WebSocket without sending peer-originated `peer-disconnected`
