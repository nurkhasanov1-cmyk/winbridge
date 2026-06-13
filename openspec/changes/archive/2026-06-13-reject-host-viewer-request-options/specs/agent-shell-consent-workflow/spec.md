## ADDED Requirements

### Requirement: Viewer request configuration is viewer-only

The agent shell SHALL treat requested permission configuration as viewer-only. Host CLI invocations with explicit `--request` MUST fail before managed runtime creation, relay connection, protocol sends, workflow audit emission, host visibility activation, signal sends, host control invocation, or workflow timer scheduling. Direct host runtime construction with non-empty `requestedPermissions` MUST fail before opening a relay connection, sending `join-session`, `hello`, authorization, lifecycle, signal, control, or workflow audit messages, granting permissions, activating host visibility, or scheduling workflow timers. Default empty host requested-permission state MAY remain valid and MUST NOT send authorization requests, grant permissions, start capture, send input, reconnect peers, suppress host visibility, invoke host controls, or bypass consent workflows. Rejection diagnostics MUST remain bounded and MUST NOT expose raw requested permission text, protocol payloads, tokens, pairing codes, credentials, private reasons, screen contents, input contents, clipboard contents, file-transfer contents, diagnostics dumps, or full secrets.

#### Scenario: Host CLI rejects explicit request option

- **WHEN** the agent shell is started as a host with `--request screen:view`
- **THEN** it exits through bounded usage handling before creating the managed runtime, connecting to the relay, sending protocol messages, scheduling workflow timers, activating host visibility, invoking host controls, or emitting workflow audit events

#### Scenario: Direct host runtime rejects non-empty requested permissions

- **WHEN** caller code creates a host runtime with non-empty `requestedPermissions`
- **THEN** runtime creation fails before opening a relay connection, sending protocol messages, scheduling workflow timers, activating host visibility, invoking host controls, or emitting workflow audit events

#### Scenario: Empty host requested permissions remain non-authorizing

- **WHEN** caller code creates a host runtime with empty `requestedPermissions`
- **THEN** runtime creation MAY succeed when all other host options are valid
- **AND** the empty requested-permission state MUST NOT send `session-authorization-request`, approve authorization, grant permissions, activate host visibility, start capture, send input, reconnect peers, suppress host visibility, invoke host controls, or bypass consent workflows

#### Scenario: Viewer request behavior remains valid

- **WHEN** the agent shell is started as a viewer with valid requested permissions
- **THEN** validation MAY succeed when each requested permission is otherwise valid
- **AND** the viewer-only role boundary MUST NOT widen permissions, bypass host approval, activate hidden sessions, start capture, send input, sync clipboard, transfer files, expose diagnostics, install services, configure startup persistence, collect credentials, or bypass consent workflows
