## ADDED Requirements

### Requirement: Host signal send authorization gate
The agent shell SHALL block host-originated public runtime `signal` sends before socket write and before local `sent` event emission unless the host runtime has locally emitted an active, visible, unexpired authorization state that grants `screen:view`.

#### Scenario: Host signal is blocked before authorization
- **WHEN** a host runtime is connected and caller code invokes public `send()` with a `signal` message before the host has emitted active visible `screen:view` authorization
- **THEN** the runtime MUST reject the send before writing to the socket
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked signal

#### Scenario: Host signal is allowed after active visible grant
- **WHEN** a host runtime has emitted an active `session-authorization-state` with `visibleToHost: true`, unexpired `expiresAt`, and `screen:view`
- **THEN** a host-originated public runtime `signal` message MAY be sent through the runtime send path
- **AND** the local `sent` event MUST continue to redact the signal payload contents

#### Scenario: Host signal fails closed after pause, revocation, termination, or expiration
- **WHEN** a host runtime has previously emitted an active visible `screen:view` state
- **AND** the local workflow then pauses, removes `screen:view`, terminates, or expires that authorization
- **THEN** later host-originated public runtime `signal` sends MUST be rejected before socket write and local `sent` event emission

#### Scenario: Host signal lifecycle callbacks observe updated authorization
- **WHEN** host workflow emits a local `sent` event for active authorization state, pause, permission revocation, termination, or expiration
- **THEN** synchronous caller code running inside that local event callback MUST observe the updated authorization state for host-originated public runtime `signal` send checks
- **AND** it MUST NOT be able to send `signal` using stale authorization after pause, permission revocation, termination, or expiration

#### Scenario: Host restart clears signal send authorization
- **WHEN** a host runtime object is stopped and started again after previously emitting active visible `screen:view` authorization
- **THEN** the restarted runtime MUST NOT treat the prior connection's authorization as active for host-originated public runtime `signal` sends
- **AND** host-originated public runtime `signal` sends MUST be rejected until the restarted runtime emits a new active visible `screen:view` state

#### Scenario: Blocked host signal diagnostics are secret-safe
- **WHEN** the runtime blocks a host-originated public runtime `signal` because authorization is missing, inactive, invisible, expired, or no longer grants `screen:view`
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw signal payloads, signal payload keys, tokens, pairing codes, authorization reasons, keystrokes, screenshots, screen contents, or input contents
