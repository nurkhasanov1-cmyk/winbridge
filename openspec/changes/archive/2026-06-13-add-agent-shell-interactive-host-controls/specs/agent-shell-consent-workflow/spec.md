## ADDED Requirements

### Requirement: Host control prompt CLI validation
The agent shell SHALL reject malformed, viewer-mode, or ambiguous host control prompt CLI configuration before starting the runtime. Host control prompt validation SHALL allow exact `true` or `false` values only for host runtimes and MUST reject host control prompt mode when interactive host consent prompt mode is also enabled.

#### Scenario: Host control prompt value is explicit
- **WHEN** the agent shell is started with `--host-control-prompt`
- **THEN** the value MUST be either `true` or `false`

#### Scenario: Host control prompt is host-only
- **WHEN** a viewer shell is started with `--host-control-prompt true`
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Host control prompt is mutually exclusive with host consent prompt
- **WHEN** a host shell is started with both `--host-control-prompt true` and `--host-consent-prompt true`
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

### Requirement: Interactive host control prompt
The host agent shell SHALL support an opt-in development host control prompt that accepts exact local commands for pause, resume, permission revocation, termination, and local disconnect. Accepted commands MUST call the managed runtime direct host controls rather than constructing workflow protocol messages directly. The prompt MUST NOT authorize screen capture, input, clipboard access, file transfer, diagnostics, reconnect, hidden sessions, stealth persistence, or consent bypass.

#### Scenario: Host control prompt accepts lifecycle commands
- **WHEN** host control prompt mode is enabled
- **AND** the host operator enters exact command `pause`, `resume`, `terminate`, or `disconnect`
- **THEN** the CLI invokes the matching managed runtime direct control

#### Scenario: Host control prompt accepts revoke command
- **WHEN** host control prompt mode is enabled
- **AND** the host operator enters exact command `revoke screen:view`
- **THEN** the CLI validates `screen:view` as a canonical permission token and invokes managed runtime `revokePermission("screen:view")`

#### Scenario: Host control prompt rejects malformed commands
- **WHEN** host control prompt mode receives a blank, unsupported, whitespace-padded, malformed, or invalid-permission command
- **THEN** it rejects the command before invoking any managed runtime direct control
- **AND** it MUST NOT send session-control, permission-revoked, authorization-state, disconnect, or audit-event messages because of that command

#### Scenario: Host control prompt preserves runtime gates
- **WHEN** host control prompt mode invokes a managed runtime direct control before visible active or paused authorization, after expiration, after terminal state, from a disconnected peer state, or for a missing permission
- **THEN** the underlying runtime rejects the control before audit writes or lifecycle protocol messages

#### Scenario: Host control prompt diagnostics are secret-safe
- **WHEN** host control prompt mode prints instructions, accepts a command, rejects a command, catches a runtime failure, or stops after stdin close
- **THEN** output MAY include bounded static command names, canonical permission names, and message byte length metadata
- **AND** output MUST NOT echo raw command lines, raw runtime exception text, protocol payloads, tokens, pairing codes, private reasons, display names, signal payloads, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents, diagnostics dumps, or input contents

#### Scenario: Host control prompt safety boundary
- **WHEN** host control prompt mode starts, receives commands, rejects commands, or stops
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide the session from the host, or bypass consent workflows
