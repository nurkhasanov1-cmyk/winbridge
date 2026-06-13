## ADDED Requirements

### Requirement: Viewer local disconnect CLI validation
The agent shell SHALL reject malformed, host-mode, or ambiguous viewer local disconnect CLI configuration before starting the runtime. Viewer local disconnect validation SHALL allow exact integer millisecond delay values from `0` through `2147483647` only for viewer runtimes. Viewer local disconnect configuration MUST NOT require requested permissions or active authorization because it closes only the local viewer connection.

#### Scenario: Viewer local disconnect delay is exact
- **WHEN** the agent shell is started with `--viewer-disconnect-after-ms`
- **THEN** the value MUST be an exact integer millisecond delay from `0` through `2147483647`

#### Scenario: Viewer local disconnect is viewer-only
- **WHEN** a host shell is started with `--viewer-disconnect-after-ms 0`
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Viewer local disconnect does not require requested permissions
- **WHEN** a viewer shell is started with `--viewer-disconnect-after-ms 0` without `--request`
- **THEN** CLI validation succeeds and the runtime MAY start normally

### Requirement: Viewer local disconnect CLI behavior
The viewer agent shell SHALL support an opt-in development local disconnect that stops the local viewer runtime after the configured delay. The disconnect MUST close only the viewer's local relay connection and MUST NOT invoke host lifecycle controls, construct or send `peer-disconnected`, emit workflow audit events, grant permissions, start signaling, change authorization lifecycle state, or expose screen, input, clipboard, file-transfer, diagnostics, token, pairing, credential, private-reason, display-name, signal-payload, or raw protocol data.

#### Scenario: Viewer local disconnect closes viewer transport
- **WHEN** viewer local disconnect mode fires while the viewer runtime is connected
- **THEN** the viewer runtime closes its local relay connection
- **AND** it MUST NOT emit authorization, lifecycle, signal, control, `peer-disconnected`, or workflow audit messages because of the local disconnect

#### Scenario: Relay notifies host about viewer disconnect
- **WHEN** a host and viewer are paired through the development relay
- **AND** viewer local disconnect mode closes the viewer connection
- **THEN** the host receives a relay-originated `peer-disconnected` notice for the viewer
- **AND** that notice MUST NOT grant permissions, start capture, send input, reconnect peers, suppress host visibility, or bypass consent workflows

#### Scenario: Viewer local disconnect safety boundary
- **WHEN** viewer local disconnect mode is configured, starts, fires, fails, or is skipped
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide the session from the host, invoke host controls, or bypass consent workflows
