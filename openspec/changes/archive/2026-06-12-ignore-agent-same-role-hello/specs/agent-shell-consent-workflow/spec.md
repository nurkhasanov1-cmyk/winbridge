## ADDED Requirements

### Requirement: Inbound same-role hello boundary
The agent shell SHALL ignore decoded inbound `hello` messages whose `role` equals the local runtime role before emitting local `received` protocol events, recording recipient availability, or running peer presence workflow handling.

#### Scenario: Same-role hello is ignored
- **WHEN** a viewer shell receives a decoded `hello` message with role `viewer` from a different peer id in the same session
- **THEN** the shell MUST NOT send a local `hello` because of that message
- **AND** the shell MUST NOT emit a local `received` protocol event for that ignored message
- **AND** the shell MUST NOT treat that message as recipient availability for public runtime `send()`

#### Scenario: Opposite-role hello remains valid presence
- **WHEN** a host shell receives a decoded `hello` message with role `viewer` from a different peer id in the same session
- **THEN** the shell MAY treat that message as peer presence and send exactly one local `hello`

#### Scenario: Ignored same-role hello input remains secret-safe
- **WHEN** the shell ignores a decoded `hello` message that declares the local runtime role
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, roles, display names, capability strings, tokens, pairing codes, private reasons, signal payloads, keystrokes, screenshots, screen contents, or input contents
