## ADDED Requirements

### Requirement: Host signal probe acknowledgement CLI validation
The agent shell SHALL reject malformed, viewer-mode, or ambiguous host signal probe acknowledgement CLI configuration before starting the runtime. Host signal probe acknowledgement validation SHALL allow exact `true` or `false` values only for host runtimes.

#### Scenario: Host signal probe acknowledgement value is explicit
- **WHEN** the agent shell is started with `--host-signal-probe-ack`
- **THEN** the value MUST be either `true` or `false`

#### Scenario: Host signal probe acknowledgement is host-only
- **WHEN** a viewer shell is started with `--host-signal-probe-ack true`
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

### Requirement: Host signal probe acknowledgement
The host agent shell SHALL support an opt-in development acknowledgement for trusted viewer signal probes. When enabled, the host MAY send one static acknowledgement `signal` per authorization id only after receiving a trusted viewer probe signal that already passed inbound signal authorization gates. The acknowledgement MUST send through the managed runtime public `send()` path and MUST NOT construct or write protocol messages directly from the CLI or bypass existing signal authorization, routing, payload validation, event redaction, disconnect, pause, revoke, termination, or expiration gates. The acknowledgement MUST NOT authorize or transmit screen capture, input, clipboard data, file-transfer data, diagnostics data, SDP, ICE candidates, reconnect material, hidden sessions, stealth persistence, or consent bypass.

#### Scenario: Host acknowledgement sends after trusted viewer probe
- **WHEN** host signal probe acknowledgement mode is enabled
- **AND** the host has active visible `screen:view` authorization
- **AND** the host receives a trusted viewer `signal` with the current authorization id and the static viewer probe marker
- **THEN** the runtime sends one acknowledgement `signal` through public `send()` with the current authorization id and a static acknowledgement marker
- **AND** local sent and received runtime events continue to redact raw signal payload contents

#### Scenario: Host acknowledgement ignores non-probe signal
- **WHEN** host signal probe acknowledgement mode is enabled
- **AND** the host receives a trusted viewer `signal` that does not contain the static viewer probe marker
- **THEN** the runtime MUST NOT send an acknowledgement

#### Scenario: Host acknowledgement is once per authorization id
- **WHEN** host signal probe acknowledgement mode is enabled
- **AND** the host receives repeated trusted viewer probe signals for the same authorization id
- **THEN** the runtime MUST send at most one acknowledgement signal for that authorization id

#### Scenario: Host acknowledgement fails closed after lifecycle loss
- **WHEN** host signal probe acknowledgement mode is enabled
- **AND** the host authorization is paused, revoked, terminated, expired, disconnected locally, disconnected remotely, or loses `screen:view` before acknowledgement send
- **THEN** the runtime MUST NOT emit a local `sent` acknowledgement signal event or write the acknowledgement signal to the socket

#### Scenario: Host acknowledgement payload is bounded and static
- **WHEN** host signal probe acknowledgement mode sends an acknowledgement
- **THEN** the payload MUST contain only the current non-secret `authorizationId` and a static acknowledgement marker
- **AND** it MUST NOT contain user-provided JSON, SDP, ICE candidates, tokens, pairing codes, credentials, private reasons, display names, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents, diagnostics dumps, or input contents

#### Scenario: Host acknowledgement safety boundary
- **WHEN** host signal probe acknowledgement mode is configured, receives a signal, sends, fails, or is skipped
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide the session from the host, reconnect peers, suppress host visibility, or bypass consent workflows
