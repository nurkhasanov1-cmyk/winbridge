## MODIFIED Requirements

### Requirement: Viewer authorization authority binding
The agent shell SHALL bind viewer-side authorization lifecycle state to the host authority from a `session-authorization-decision` addressed to the local viewer before using lifecycle messages to authorize viewer-originated `signal` sends. The viewer runtime MUST ignore inbound legacy `host-consent-decision` messages before local `received` protocol event emission and MUST NOT treat them as authorization decisions.

#### Scenario: Viewer ignores authorization state without bound decision
- **WHEN** a viewer runtime receives a decoded `session-authorization-state` before it has received a `session-authorization-decision` for the local viewer and matching authorization id
- **THEN** the runtime MUST ignore that state before local `received` protocol event emission
- **AND** later viewer-originated `signal` sends MUST still be rejected before socket write and local `sent` event emission

#### Scenario: Viewer ignores mismatched authorization authority
- **WHEN** a viewer runtime has received a `session-authorization-decision` for the local viewer from one host authority
- **AND** it then receives `session-authorization-state`, `permission-revoked`, or `session-control` from a different actor authority for the same session
- **THEN** the runtime MUST ignore the mismatched lifecycle message before local `received` protocol event emission
- **AND** the mismatched message MUST NOT grant, restore, pause, revoke, terminate, or otherwise alter viewer signal-send authorization

#### Scenario: Viewer ignores legacy host consent decision
- **WHEN** a viewer runtime receives a decoded legacy `host-consent-decision` addressed to the local viewer
- **THEN** the runtime MUST ignore that legacy decision before local `received` protocol event emission
- **AND** the ignored legacy decision MUST NOT bind host authority, grant permissions, activate visibility, authorize viewer-originated `signal` sends, start capture, send input, suppress host visibility, or bypass consent workflows

#### Scenario: Viewer ignores decisions for another viewer
- **WHEN** a viewer runtime receives a `session-authorization-decision` whose `viewerPeerId` does not identify the local viewer
- **THEN** the runtime MUST ignore that decision before local `received` protocol event emission
- **AND** the ignored decision MUST NOT bind host authority or authorize viewer-originated `signal` sends

#### Scenario: Viewer denied decision remains fail-closed
- **WHEN** a viewer runtime receives a denied `session-authorization-decision` for the local viewer
- **AND** it later receives an active `session-authorization-state` for the same authorization id and host authority
- **THEN** the runtime MUST ignore the active state before local `received` protocol event emission
- **AND** later viewer-originated `signal` sends MUST still be rejected before socket write and local `sent` event emission

#### Scenario: Viewer restart clears authorization authority binding
- **WHEN** a viewer runtime object is stopped and started again after previously observing active visible `screen:view` authorization
- **THEN** the restarted runtime MUST NOT treat the prior connection's decision, host authority, or authorization state as active
- **AND** viewer-originated `signal` sends MUST be rejected until the restarted runtime receives a new local-viewer decision and matching active visible state

#### Scenario: Ignored viewer authorization authority diagnostics are secret-safe
- **WHEN** the viewer runtime ignores an unbound or mismatched authorization lifecycle message, or ignores a legacy host consent decision
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, authorization ids, actor ids, signal payloads, tokens, pairing codes, private reasons, grant scopes, keystrokes, screenshots, screen contents, or input contents
