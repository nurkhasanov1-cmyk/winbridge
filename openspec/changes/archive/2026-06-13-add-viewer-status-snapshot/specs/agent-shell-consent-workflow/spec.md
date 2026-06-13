## ADDED Requirements

### Requirement: Viewer status snapshot
The managed viewer agent shell runtime SHALL expose a read-only local viewer status snapshot derived from the current viewer authorization state. The snapshot MUST NOT send protocol messages, emit workflow audit events, grant permissions, change authorization lifecycle state, start signaling, or invoke host controls. Status snapshots MUST be viewer-only and MUST expose only bounded lifecycle metadata: local state, visible host-session flag, action-capable permission count, and optional authorization id/status.

#### Scenario: Viewer status is inactive before authorization
- **WHEN** a viewer runtime has not received an authorization decision or visible active state
- **THEN** the viewer status snapshot reports inactive local state, `visibleToHost: false`, and permission count `0`
- **AND** reading status does not send join, authorization, lifecycle, signal, or audit messages

#### Scenario: Viewer status reflects active visible authorization
- **WHEN** a viewer runtime has active visible authorization with a granted permission scope
- **THEN** the viewer status snapshot reports active local state, authorization status `active`, `visibleToHost: true`, and the effective granted permission count

#### Scenario: Viewer status reflects paused authorization
- **WHEN** a viewer runtime receives a pause for an active visible authorization
- **THEN** the viewer status snapshot reports paused local state, authorization status `paused`, `visibleToHost: true`, and the retained granted permission count

#### Scenario: Viewer status reports invisible or terminal authorization as inactive
- **WHEN** a viewer runtime has only approved-but-invisible, denied, revoked, terminated, or expired authorization state
- **THEN** the viewer status snapshot reports inactive local state, `visibleToHost: false`, and permission count `0`

#### Scenario: Viewer status is viewer-only
- **WHEN** caller code asks a host runtime for viewer status
- **THEN** the runtime rejects the request without sending protocol messages or changing local authorization state
