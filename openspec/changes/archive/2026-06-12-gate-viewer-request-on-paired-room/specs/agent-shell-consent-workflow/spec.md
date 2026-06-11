# agent-shell-consent-workflow Delta

## MODIFIED Requirements

### Requirement: Viewer authorization request
The viewer shell SHALL send a session authorization request only when requested permissions are explicitly configured and the relay has indicated a paired two-peer room.

#### Scenario: Viewer requests screen view
- **WHEN** the viewer shell is started with requested `screen:view` permission
- **AND** the relay indicates a two-peer room
- **THEN** it sends a `session-authorization-request` message after joining the relay

#### Scenario: Viewer request waits for paired room
- **WHEN** the viewer shell has requested permissions configured
- **AND** the relay returns `relay-ready` with room size 1
- **THEN** it MUST NOT send a `session-authorization-request`
- **AND** it MUST NOT approve authorization, activate a visible session, grant permissions, start capture, send input, reconnect a peer, suppress host visibility, or bypass consent workflows

