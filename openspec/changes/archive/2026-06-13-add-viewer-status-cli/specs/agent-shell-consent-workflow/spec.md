## ADDED Requirements

### Requirement: Viewer status CLI validation
The agent shell SHALL reject malformed, host-mode, or ambiguous viewer status CLI configuration before starting the runtime. Viewer status validation SHALL allow exact integer millisecond delay values from `0` through `2147483647` only for viewer runtimes. Viewer status configuration MUST NOT require requested permissions because it reads only local status metadata and does not send protocol messages.

#### Scenario: Viewer status delay is exact
- **WHEN** the agent shell is started with `--viewer-status-after-ms`
- **THEN** the value MUST be an exact integer millisecond delay from `0` through `2147483647`

#### Scenario: Viewer status is viewer-only
- **WHEN** a host shell is started with `--viewer-status-after-ms 0`
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Viewer status does not require requested permissions
- **WHEN** a viewer shell is started with `--viewer-status-after-ms 0` without `--request`
- **THEN** CLI validation succeeds and the runtime MAY start normally

### Requirement: Viewer status CLI output
The viewer agent shell SHALL support an opt-in development status print that calls the managed runtime `getViewerStatus()` snapshot after the configured delay. The status print MUST expose only bounded local lifecycle metadata: state, visible host-session flag, action-capable permission count, and optional authorization id/status. The status print MUST NOT send protocol messages, emit workflow audit events, grant permissions, change authorization lifecycle state, start signaling, invoke host controls, or expose screen, input, clipboard, file-transfer, diagnostics, token, pairing, credential, private-reason, display-name, peer-id, signal-payload, or raw protocol data.

#### Scenario: Viewer status prints inactive status
- **WHEN** viewer status print mode fires before the viewer has observed active visible authorization
- **THEN** it prints inactive local status metadata with `visibleToHost: false` and permission count `0`
- **AND** it MUST NOT emit authorization, lifecycle, signal, control, or workflow audit messages because of the status read

#### Scenario: Viewer status prints active status
- **WHEN** viewer status print mode fires after the viewer has observed active visible authorization
- **THEN** it prints active local status metadata with `visibleToHost: true`, the action-capable permission count, and optional authorization id/status

#### Scenario: Viewer status print safety boundary
- **WHEN** viewer status print mode is configured, starts, fires, fails, or is skipped
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide the session from the host, reconnect peers, suppress host visibility, invoke host controls, or bypass consent workflows
