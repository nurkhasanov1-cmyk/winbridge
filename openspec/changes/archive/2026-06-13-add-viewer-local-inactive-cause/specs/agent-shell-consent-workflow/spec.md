## MODIFIED Requirements

### Requirement: Viewer status CLI output
The viewer agent shell SHALL support an opt-in development status print that calls the managed runtime `getViewerStatus()` snapshot after the configured delay. The status print MUST expose only bounded local lifecycle metadata: state, visible host-session flag, action-capable permission count, optional authorization id/status, optional relay-defined remote disconnect reason code after trusted remote host disconnect, and optional local inactive cause after explicit viewer local leave. The status print MUST NOT send protocol messages, emit workflow audit events, grant permissions, change authorization lifecycle state, start signaling, reconnect peers, invoke host controls, or expose screen, input, clipboard, file-transfer, diagnostics, token, pairing, credential, private-reason, display-name, peer-id, signal-payload, raw protocol data, or raw WebSocket close reason text.

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

#### Scenario: Viewer status prints local inactive cause
- **WHEN** viewer status print mode fires after the viewer has explicitly left locally
- **THEN** it prints inactive local status metadata with `visibleToHost: false`, permission count `0`, and the bounded local inactive cause
- **AND** it MUST NOT print authorization id/status from the left connection scope, remote disconnect reason codes, peer ids, display names, private reasons, signal payloads, tokens, pairing codes, raw protocol data, or raw WebSocket close reason text

#### Scenario: Viewer status print safety boundary
- **WHEN** viewer status print mode is configured, starts, fires, fails, or is skipped
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide the session from the host, reconnect peers, suppress host visibility, invoke host controls, or bypass consent workflows

### Requirement: Viewer control prompt local commands
The interactive viewer control prompt SHALL accept only exact `status` and `disconnect` command lines. The `status` command MUST print the existing bounded viewer status snapshot and MUST NOT invoke lifecycle controls or public sends. The `disconnect` command MUST stop only the local viewer runtime and MUST NOT construct or send `peer-disconnected`, lifecycle, signal, control, or workflow audit messages. Malformed commands MUST be rejected without echoing raw command text.

#### Scenario: Viewer control prompt prints status
- **WHEN** viewer control prompt mode receives exact command `status`
- **THEN** it prints bounded local viewer status metadata with state, visible flag, permission count, optional authorization id/status, optional relay-defined remote disconnect reason code after trusted remote host disconnect, and optional local inactive cause after explicit viewer local leave
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

### Requirement: Managed viewer local leave control
The managed agent shell runtime SHALL expose an explicit viewer-only local leave operation. The leave operation MUST close only the local viewer relay connection, clear connection-scoped local viewer authorization state, and MUST NOT require requested permissions or active authorization. It MUST NOT invoke host lifecycle controls, construct or send `peer-disconnected`, emit workflow audit events, grant permissions, start signaling, change host authorization lifecycle state, reconnect peers, or expose screen, input, clipboard, file-transfer, diagnostics, token, pairing, credential, private-reason, display-name, signal-payload, or raw protocol data.

#### Scenario: Viewer leave closes local transport
- **WHEN** a viewer runtime invokes local leave while connected
- **THEN** the viewer runtime closes its local relay connection
- **AND** it MUST NOT emit authorization, lifecycle, signal, control, `peer-disconnected`, or workflow audit messages because of the local leave

#### Scenario: Viewer status after local leave is inactive
- **WHEN** a viewer runtime has active visible authorization
- **AND** local leave closes the viewer connection
- **THEN** the viewer status snapshot reports inactive local state, `visibleToHost: false`, permission count `0`, and a bounded local inactive cause
- **AND** it MUST NOT include optional authorization id or authorization status metadata from the left connection scope
- **AND** reading status after leave MUST NOT send protocol messages, emit workflow audit events, grant permissions, start signaling, invoke host controls, reconnect peers, or change authorization lifecycle state

#### Scenario: Viewer leave is viewer-only
- **WHEN** a host runtime invokes local leave
- **THEN** the runtime rejects the request without closing the host transport, sending protocol messages, changing host authorization state, deactivating the host indicator, or writing audit records

#### Scenario: Viewer CLI helpers use local leave
- **WHEN** scheduled viewer local disconnect or viewer control prompt `disconnect` fires
- **THEN** it invokes the managed viewer local leave operation
- **AND** the same viewer-only and no-forged-message safety boundary applies
