## ADDED Requirements

### Requirement: Host visible-session indicator events
The host agent shell SHALL emit local secret-safe indicator events for visible host session state changes. Indicator events are local UI metadata only and MUST NOT authorize screen capture, input, clipboard access, file transfer, diagnostics, reconnect, hidden sessions, or consent bypass.

#### Scenario: Indicator activates after visible approval
- **WHEN** a host shell explicitly approves an authorization request and emits an active visible session state
- **THEN** it MUST emit a local indicator event with state `active`, the authorization id, authorization status `active`, `visibleToHost: true`, and the granted permission count
- **AND** the indicator event MUST NOT be emitted before explicit approval and visible activation

#### Scenario: Indicator is withheld without visible activation
- **WHEN** a host shell approves an authorization request but visible session state is false
- **THEN** it MUST NOT emit an active or paused indicator event

#### Scenario: Indicator follows pause, resume, and partial revocation
- **WHEN** a host shell has emitted an active indicator for a visible authorization
- **AND** the host workflow pauses, resumes, or revokes one permission while remaining non-terminal
- **THEN** it MUST emit a local indicator update that reflects the current active or paused state and current permission count

#### Scenario: Indicator deactivates on terminal or disconnect lifecycle
- **WHEN** a host shell has emitted an active or paused indicator for a visible authorization
- **AND** the host workflow reaches final revocation, termination, expiration, local disconnect, runtime stop, local socket close, or trusted remote peer disconnect
- **THEN** it MUST emit a local indicator event with state `inactive`

#### Scenario: Indicator diagnostics are secret-safe
- **WHEN** the runtime emits or logs host indicator updates
- **THEN** indicator events and logs MAY include bounded lifecycle metadata such as authorization id, authorization status, indicator state, visible flag, permission count, and cause
- **AND** they MUST NOT expose raw protocol payloads, tokens, pairing codes, private reasons, display names, signal payloads, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents, diagnostics dumps, or input contents
