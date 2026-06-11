## ADDED Requirements

### Requirement: Managed runtime option validation
The managed agent shell runtime SHALL reject malformed direct runtime options before opening a relay connection, sending protocol messages, scheduling workflow timers, or emitting authorization decisions.

#### Scenario: Runtime relay URL is not WebSocket
- **WHEN** the managed runtime is configured with a malformed, relative, or non-WebSocket relay URL
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime identity fields are malformed
- **WHEN** the managed runtime is configured with a malformed role, session id, pairing code, peer id, device id, or display name
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime requested permissions are malformed
- **WHEN** the managed runtime is configured with invalid, duplicate, or oversized requested permissions
- **THEN** it fails before connecting to the relay or sending a session authorization request

#### Scenario: Runtime token is blank
- **WHEN** the managed runtime is configured with an empty or whitespace-only token
- **THEN** it fails before connecting to the relay or adding the token to a relay URL

#### Scenario: Runtime workflow timer is unsafe
- **WHEN** the managed runtime is configured with a non-integer, negative, or oversized workflow timer delay
- **THEN** it fails before connecting to the relay or scheduling workflow timers

#### Scenario: Runtime visible-session flag is malformed
- **WHEN** the managed runtime is configured with a non-boolean visible-session flag
- **THEN** it fails before connecting to the relay or sending any authorization decision

#### Scenario: Runtime decision or lifecycle reason is malformed
- **WHEN** the managed runtime is configured with a blank or oversized decision or lifecycle reason
- **THEN** it fails before connecting to the relay or sending any protocol message

#### Scenario: Runtime revoke permission is malformed
- **WHEN** the managed runtime is configured with an invalid revocation permission
- **THEN** it fails before connecting to the relay or scheduling permission revocation
