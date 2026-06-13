## ADDED Requirements

### Requirement: Viewer signal probe CLI validation
The agent shell SHALL reject malformed, host-mode, or ambiguous viewer signal probe CLI configuration before starting the runtime. Viewer signal probe validation SHALL allow exact integer millisecond delay values from `0` through the safe JavaScript timer delay bound only for viewer runtimes that explicitly request `screen:view`.

#### Scenario: Viewer signal probe delay is exact
- **WHEN** the agent shell is started with `--viewer-signal-probe-after-ms`
- **THEN** the value MUST be an exact integer millisecond delay from `0` through `2147483647`

#### Scenario: Viewer signal probe is viewer-only
- **WHEN** a host shell is started with `--viewer-signal-probe-after-ms 0`
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Viewer signal probe requires screen view request
- **WHEN** a viewer shell is started with `--viewer-signal-probe-after-ms 0` without requesting `screen:view`
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

### Requirement: Viewer signal probe
The viewer agent shell SHALL support an opt-in development signal probe that sends one static `signal` payload only after the viewer observes active visible `screen:view` authorization. The probe MUST send through the managed runtime public `send()` path and MUST NOT construct or write protocol messages directly from the CLI or bypass existing signal authorization, routing, payload validation, event redaction, disconnect, pause, revoke, termination, or expiration gates. The probe MUST NOT authorize or transmit screen capture, input, clipboard data, file-transfer data, diagnostics data, SDP, ICE candidates, reconnect material, hidden sessions, stealth persistence, or consent bypass.

#### Scenario: Viewer signal probe sends after active visible authorization
- **WHEN** viewer signal probe mode is enabled
- **AND** the viewer observes active visible authorization that grants `screen:view`
- **THEN** the runtime sends one `signal` through public `send()` with the current authorization id and a static probe marker
- **AND** local sent and received runtime events continue to redact raw signal payload contents

#### Scenario: Viewer signal probe is withheld before authorization
- **WHEN** viewer signal probe mode is enabled
- **AND** the viewer has not observed active visible `screen:view` authorization
- **THEN** the runtime MUST NOT send a `signal` probe

#### Scenario: Viewer signal probe fails closed after lifecycle loss
- **WHEN** viewer signal probe mode is enabled
- **AND** the viewer's active authorization is paused, revoked, terminated, expired, disconnected locally, disconnected remotely, or loses `screen:view` before the probe fires
- **THEN** the runtime MUST NOT emit a local `sent` signal event or write the probe signal to the socket

#### Scenario: Viewer signal probe payload is bounded and static
- **WHEN** viewer signal probe mode sends a probe
- **THEN** the payload MUST contain only the current non-secret `authorizationId` and a static probe marker
- **AND** it MUST NOT contain user-provided JSON, SDP, ICE candidates, tokens, pairing codes, credentials, private reasons, display names, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents, diagnostics dumps, or input contents

#### Scenario: Viewer signal probe safety boundary
- **WHEN** viewer signal probe mode is configured, starts, fires, fails, or is skipped
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide the session from the host, reconnect peers, suppress host visibility, or bypass consent workflows
