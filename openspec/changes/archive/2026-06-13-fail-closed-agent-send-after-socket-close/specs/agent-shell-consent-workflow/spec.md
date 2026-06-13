## ADDED Requirements

### Requirement: Public sends fail closed after local socket close
The managed agent shell SHALL record local peer disconnected state when its WebSocket close event fires. After that close state is recorded and until a fresh runtime `start()` resets connection-scoped state, public `send()` calls MUST fail before protocol validation, socket write, and local `sent` event emission. This failure MUST NOT grant permissions, activate visibility, start capture, send input, reconnect a peer, suppress host visibility, or bypass consent workflows.

#### Scenario: Public send after socket close is blocked first
- **WHEN** a runtime has emitted a local `closed` event after WebSocket close
- **AND** caller code invokes public `send()` with a peer message that contains private protocol payload markers
- **THEN** the runtime rejects the send with a bounded local-disconnect error before socket write
- **AND** the runtime MUST NOT emit a local `sent` event for that blocked message

#### Scenario: Socket-close send diagnostics are secret-safe
- **WHEN** the runtime blocks a public send because the local socket has closed
- **THEN** thrown errors, runtime events, and logs MUST NOT expose raw protocol payloads, signal payloads, message types, session ids, peer ids, tokens, pairing codes, private reasons, keystrokes, screenshots, screen contents, or input contents

#### Scenario: Runtime restart clears local socket close state
- **WHEN** a runtime object is started again after a previous local socket close
- **THEN** the restarted connection MUST NOT inherit the previous local disconnected state
- **AND** public sends remain subject to the normal recipient, authority, authorization, and socket-open gates for the new connection
