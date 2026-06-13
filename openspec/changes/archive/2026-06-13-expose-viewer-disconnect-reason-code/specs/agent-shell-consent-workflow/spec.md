## MODIFIED Requirements

### Requirement: Viewer status snapshot
The managed viewer agent shell runtime SHALL expose a read-only local viewer status snapshot derived from the current viewer authorization state. The snapshot MUST NOT send protocol messages, emit workflow audit events, grant permissions, change authorization lifecycle state, start signaling, reconnect peers, or invoke host controls. Status snapshots MUST be viewer-only and MUST expose only bounded lifecycle metadata: local state, visible host-session flag, action-capable permission count, optional authorization id/status, and optional relay-defined remote disconnect reason code after trusted remote host disconnect.

#### Scenario: Viewer status is inactive before authorization
- **WHEN** a viewer runtime has not received an authorization decision or visible active state
- **THEN** the viewer status snapshot reports inactive local state, `visibleToHost: false`, and permission count `0`
- **AND** reading status does not send join, authorization, lifecycle, signal, or audit messages

#### Scenario: Viewer status reflects active visible authorization
- **WHEN** a viewer runtime has active visible authorization with a granted permission scope
- **THEN** the viewer status snapshot reports active local state, authorization status `active`, `visibleToHost: true`, and the effective granted permission count

#### Scenario: Viewer status reflects paused authorization
- **WHEN** a viewer runtime receives a pause for an active visible authorization
- **THEN** the viewer status snapshot reports paused local state, authorization status `paused`, `visibleToHost: true`, and the retained granted permission count

#### Scenario: Viewer status reports invisible or terminal authorization as inactive
- **WHEN** a viewer runtime has only approved-but-invisible, denied, revoked, terminated, or expired authorization state
- **THEN** the viewer status snapshot reports inactive local state, `visibleToHost: false`, and permission count `0`

#### Scenario: Viewer status is viewer-only
- **WHEN** caller code asks a host runtime for viewer status
- **THEN** the runtime rejects the request without sending protocol messages or changing local authorization state

### Requirement: Viewer status CLI output
The viewer agent shell SHALL support an opt-in development status print that calls the managed runtime `getViewerStatus()` snapshot after the configured delay. The status print MUST expose only bounded local lifecycle metadata: state, visible host-session flag, action-capable permission count, optional authorization id/status, and optional relay-defined remote disconnect reason code after trusted remote host disconnect. The status print MUST NOT send protocol messages, emit workflow audit events, grant permissions, change authorization lifecycle state, start signaling, reconnect peers, invoke host controls, or expose screen, input, clipboard, file-transfer, diagnostics, token, pairing, credential, private-reason, display-name, peer-id, signal-payload, raw protocol data, or raw WebSocket close reason text.

#### Scenario: Viewer status prints inactive status
- **WHEN** viewer status print mode fires before the viewer has observed active visible authorization
- **THEN** it prints inactive local status metadata with `visibleToHost: false` and permission count `0`
- **AND** it MUST NOT emit authorization, lifecycle, signal, control, or workflow audit messages because of the status read

#### Scenario: Viewer status prints active status
- **WHEN** viewer status print mode fires after the viewer has observed active visible authorization
- **THEN** it prints active local status metadata with `visibleToHost: true`, the action-capable permission count, and optional authorization id/status

#### Scenario: Viewer status prints trusted disconnect reason code
- **WHEN** viewer status print mode fires after the viewer has recorded trusted remote host disconnect state
- **THEN** it prints inactive local status metadata with `visibleToHost: false`, permission count `0`, optional authorization id/status, and the bounded relay-defined remote disconnect reason code
- **AND** it MUST NOT print peer ids, display names, private reasons, signal payloads, tokens, pairing codes, raw protocol data, or raw WebSocket close reason text

#### Scenario: Viewer status print safety boundary
- **WHEN** viewer status print mode is configured, starts, fires, fails, or is skipped
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide the session from the host, reconnect peers, suppress host visibility, invoke host controls, or bypass consent workflows

### Requirement: Viewer status reflects trusted remote disconnect
The managed viewer agent shell runtime SHALL report inactive local viewer status after it records trusted remote host disconnect state. The status snapshot MUST keep optional bounded authorization id/status metadata and the bounded relay-defined remote disconnect reason code when available, but MUST report `visibleToHost: false` and permission count `0`. Reading status after disconnect MUST NOT send protocol messages, emit workflow audit events, grant permissions, start signaling, invoke host controls, reconnect peers, or change authorization lifecycle state.

#### Scenario: Viewer status is inactive after host disconnect
- **WHEN** a viewer runtime has active visible authorization
- **AND** it records a trusted relay-originated `peer-disconnected` notice for the observed host
- **THEN** the viewer status snapshot reports inactive local state, `visibleToHost: false`, and permission count `0`
- **AND** it preserves optional authorization id/status metadata from the last local viewer authorization
- **AND** it includes only the bounded relay-defined disconnect reason code from the trusted notice

#### Scenario: Viewer status read after disconnect remains local
- **WHEN** a viewer runtime reads status after recording trusted host disconnect state
- **THEN** it MUST NOT emit authorization, lifecycle, signal, control, `peer-disconnected`, or workflow audit messages because of the status read

### Requirement: Viewer control prompt local commands
The interactive viewer control prompt SHALL accept only exact `status` and `disconnect` command lines. The `status` command MUST print the existing bounded viewer status snapshot and MUST NOT invoke lifecycle controls or public sends. The `disconnect` command MUST stop only the local viewer runtime and MUST NOT construct or send `peer-disconnected`, lifecycle, signal, control, or workflow audit messages. Malformed commands MUST be rejected without echoing raw command text.

#### Scenario: Viewer control prompt prints status
- **WHEN** viewer control prompt mode receives exact command `status`
- **THEN** it prints bounded local viewer status metadata with state, visible flag, permission count, optional authorization id/status, and optional relay-defined remote disconnect reason code after trusted remote host disconnect
- **AND** it does not invoke host lifecycle controls, viewer local disconnect, or public runtime sends

#### Scenario: Viewer control prompt disconnects locally
- **WHEN** viewer control prompt mode receives exact command `disconnect`
- **THEN** it stops the local viewer runtime
- **AND** it MUST NOT emit authorization, lifecycle, signal, control, `peer-disconnected`, or workflow audit messages because of the command

#### Scenario: Viewer control prompt rejects malformed commands
- **WHEN** viewer control prompt mode receives whitespace-padded, case-varied, suffixed, or unknown command input
- **THEN** it rejects the command before reading runtime status, stopping the runtime, invoking host lifecycle controls, or sending protocol messages
- **AND** prompt output MUST NOT echo the raw command line

#### Scenario: Viewer control prompt safety boundary
- **WHEN** viewer control prompt mode starts, accepts a command, rejects a command, fails, or stops
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide the session from the host, reconnect peers, invoke host controls, suppress host visibility, or bypass consent workflows
