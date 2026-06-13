## ADDED Requirements

### Requirement: Viewer status reflects local socket close
The managed viewer agent shell runtime SHALL report inactive local viewer status after the local viewer WebSocket closes without an explicit viewer local leave and without a trusted remote host disconnect already being recorded. The status snapshot MUST expose only bounded local inactive cause metadata, MUST report `visibleToHost: false` and permission count `0`, and MUST NOT preserve authorization id/status metadata from the closed local connection scope. Reading status after local socket close MUST NOT send protocol messages, emit workflow audit events, grant permissions, start signaling, invoke host controls, reconnect peers, or change authorization lifecycle state.

#### Scenario: Viewer status is inactive after local socket close
- **WHEN** a viewer runtime has active visible authorization
- **AND** the local viewer WebSocket closes without an explicit viewer local leave
- **AND** the viewer has not recorded trusted remote host disconnect state
- **THEN** the viewer status snapshot reports inactive local state, `visibleToHost: false`, permission count `0`, and bounded local inactive cause `socket-closed`
- **AND** it MUST NOT include authorization id/status metadata from the closed local connection scope or a remote disconnect reason code

#### Scenario: Viewer status read after local socket close remains local
- **WHEN** a viewer runtime reads status after local socket close
- **THEN** it MUST NOT emit authorization, lifecycle, signal, control, `peer-disconnected`, or workflow audit messages because of the status read

#### Scenario: Trusted remote disconnect metadata is not overwritten by socket close
- **WHEN** a viewer runtime has recorded trusted remote host disconnect state
- **AND** the local viewer WebSocket later closes
- **THEN** the viewer status snapshot preserves the trusted remote disconnect status semantics instead of replacing them with local socket-close cause metadata

## MODIFIED Requirements

### Requirement: Viewer status CLI output
The viewer agent shell SHALL support an opt-in development status print that calls the managed runtime `getViewerStatus()` snapshot after the configured delay. The status print MUST expose only bounded local lifecycle metadata: state, visible host-session flag, action-capable permission count, optional authorization id/status, optional relay-defined remote disconnect reason code after trusted remote host disconnect, and optional local inactive cause after explicit viewer local leave or local viewer socket close. The status print MUST NOT send protocol messages, emit workflow audit events, grant permissions, change authorization lifecycle state, start signaling, reconnect peers, invoke host controls, or expose screen, input, clipboard, file-transfer, diagnostics, token, pairing, credential, private-reason, display-name, peer-id, signal-payload, raw protocol data, or raw WebSocket close reason text.

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
- **WHEN** viewer status print mode fires after the viewer has explicitly left locally or after the local viewer socket has closed
- **THEN** it prints inactive local status metadata with `visibleToHost: false`, permission count `0`, and the bounded local inactive cause
- **AND** it MUST NOT print authorization id/status from the left or closed local connection scope, remote disconnect reason codes, peer ids, display names, private reasons, signal payloads, tokens, pairing codes, raw protocol data, or raw WebSocket close reason text

#### Scenario: Viewer status print safety boundary
- **WHEN** viewer status print mode is configured, starts, fires, fails, or is skipped
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide the session from the host, reconnect peers, suppress host visibility, invoke host controls, or bypass consent workflows

### Requirement: Viewer control prompt local commands
The interactive viewer control prompt SHALL accept only exact `status` and `disconnect` command lines. The `status` command MUST print the existing bounded viewer status snapshot and MUST NOT invoke lifecycle controls or public sends. The `disconnect` command MUST stop only the local viewer runtime and MUST NOT construct or send `peer-disconnected`, lifecycle, signal, control, or workflow audit messages. Malformed commands MUST be rejected without echoing raw command text.

#### Scenario: Viewer control prompt prints status
- **WHEN** viewer control prompt mode receives exact command `status`
- **THEN** it prints bounded local viewer status metadata with state, visible flag, permission count, optional authorization id/status, optional relay-defined remote disconnect reason code after trusted remote host disconnect, and optional local inactive cause after explicit viewer local leave or local viewer socket close
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
