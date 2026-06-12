## ADDED Requirements

### Requirement: Host authorization request peer binding
The agent shell SHALL ignore decoded inbound `session-authorization-request` messages on a host runtime unless the request `viewerPeerId` matches an accepted opposite-role viewer peer observed through inbound `hello`, before emitting local `received` protocol events or running host authorization workflow handling.

#### Scenario: Unbound host authorization request is ignored
- **WHEN** a host shell receives a decoded same-session `session-authorization-request`
- **AND** the host has not accepted an opposite-role viewer `hello`
- **THEN** the shell MUST NOT emit a local `received` protocol event for that ignored request
- **AND** the shell MUST NOT send authorization decisions, authorization states, or audit events because of that request

#### Scenario: Mismatched host authorization request is ignored
- **WHEN** a host shell has accepted an opposite-role viewer `hello` for viewer peer `viewer-1`
- **AND** the host receives a decoded same-session `session-authorization-request` whose `viewerPeerId` is a different viewer peer id
- **THEN** the shell MUST NOT emit a local `received` protocol event for that ignored request
- **AND** the shell MUST NOT send authorization decisions, authorization states, or audit events because of that request

#### Scenario: Bound host authorization request remains valid
- **WHEN** a host shell has accepted an opposite-role viewer `hello` for viewer peer `viewer-1`
- **AND** the host receives a decoded same-session `session-authorization-request` whose `viewerPeerId` is `viewer-1`
- **THEN** the normal explicit host-decision workflow MAY handle that request

#### Scenario: Ignored host authorization request input remains secret-safe
- **WHEN** the shell ignores a host authorization request because no matching viewer peer has been observed
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, permission scopes, tokens, pairing codes, private reasons, signal payloads, keystrokes, screenshots, screen contents, or input contents
