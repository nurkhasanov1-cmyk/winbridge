## ADDED Requirements

### Requirement: Viewer signal authorization gate
The agent shell SHALL block viewer-originated `signal` sends before socket write and before local `sent` event emission unless the viewer has observed a host-originated active, visible, unexpired authorization state that grants `screen:view`.

#### Scenario: Viewer signal is blocked before authorization
- **WHEN** a viewer runtime is connected and attempts to send a `signal` message before receiving an active visible authorization state with `screen:view`
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked signal

#### Scenario: Viewer signal is allowed after active visible grant
- **WHEN** a viewer runtime receives an active `session-authorization-state` with `visibleToHost: true`, unexpired `expiresAt`, and `screen:view`
- **THEN** a viewer-originated `signal` message MAY be sent through the runtime send path
- **AND** the local `sent` event MUST continue to redact the signal payload contents

#### Scenario: Viewer signal fails closed after pause, revocation, termination, or expiration
- **WHEN** a viewer runtime has previously observed an active visible `screen:view` state
- **AND** it then observes a pause control, a state whose status is not `active`, a permission revocation that removes `screen:view`, or the authorization expires
- **THEN** later viewer-originated `signal` sends MUST be rejected before socket write and local `sent` event emission

#### Scenario: Blocked viewer signal diagnostics are secret-safe
- **WHEN** the runtime blocks a viewer-originated `signal` because authorization is missing, inactive, invisible, expired, or no longer grants `screen:view`
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw signal payloads, signal payload keys, tokens, pairing codes, authorization reasons, keystrokes, screenshots, screen contents, or input contents
