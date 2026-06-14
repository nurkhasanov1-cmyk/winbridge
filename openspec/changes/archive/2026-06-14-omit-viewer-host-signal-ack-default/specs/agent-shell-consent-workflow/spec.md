## ADDED Requirements

### Requirement: Viewer host acknowledgement defaults are omitted
The agent shell SHALL represent an omitted viewer `--host-signal-probe-ack` option as absent host acknowledgement configuration before managed runtime creation. This omitted viewer default MUST NOT be treated as explicit host workflow state, MUST NOT block otherwise valid viewer CLI startup, and MUST NOT enable host signal acknowledgement behavior. Explicit viewer `--host-signal-probe-ack` values, including `false`, remain host-only configuration and MUST be rejected before runtime startup.

#### Scenario: Viewer default handoff omits host acknowledgement
- **WHEN** the agent shell parses a viewer CLI invocation that omits `--host-signal-probe-ack`
- **THEN** the parsed runtime handoff does not define host acknowledgement configuration
- **AND** managed runtime creation may proceed when all other viewer options are valid

#### Scenario: Explicit viewer host acknowledgement false remains rejected
- **WHEN** the agent shell parses a viewer CLI invocation with `--host-signal-probe-ack false`
- **THEN** it exits through bounded usage handling before creating the managed runtime, connecting to the relay, sending protocol messages, scheduling workflow timers, acknowledging signals, activating host visibility, or invoking host controls

#### Scenario: Omitted viewer default remains non-authorizing
- **WHEN** viewer CLI startup omits host acknowledgement configuration
- **THEN** the omission MUST NOT grant permissions, approve authorization, send host acknowledgements, start capture, send input, reconnect peers, suppress host visibility, sync clipboard, transfer files, expose diagnostics, install services, configure startup persistence, collect credentials, hide the session from the host, or bypass consent workflows
