## MODIFIED Requirements

### Requirement: Viewer authorization authority binding
The agent shell SHALL bind viewer-side authorization lifecycle state to the observed host authority from a `session-authorization-decision` addressed to the local viewer before using lifecycle messages to authorize viewer-originated `signal` sends. The viewer runtime MUST ignore inbound `session-authorization-decision` messages before local `received` protocol event emission when the decision's `hostPeerId` does not match the already observed opposite-role host peer. The viewer runtime MUST ignore inbound `audit-event` messages before local `received` protocol event emission when the event's `actorPeerId` does not match the already observed opposite-role host peer. Viewer-side `session-control` messages MUST match both the bound host authority and the current authorization id before they can change local authorization state. The viewer runtime MUST ignore inbound legacy `host-consent-decision` messages before local `received` protocol event emission and MUST NOT treat them as authorization decisions.

#### Scenario: Viewer ignores authorization state without bound decision
- **WHEN** a viewer runtime receives a decoded `session-authorization-state` before it has received a `session-authorization-decision` for the local viewer and matching authorization id
- **THEN** the runtime MUST ignore that state before local `received` protocol event emission
- **AND** later viewer-originated `signal` sends MUST still be rejected before socket write and local `sent` event emission

#### Scenario: Viewer ignores decision before observing host authority
- **WHEN** a viewer runtime receives a decoded `session-authorization-decision` for the local viewer before observing an opposite-role host peer with the same peer id as the decision's `hostPeerId`
- **THEN** the runtime MUST ignore that decision before local `received` protocol event emission
- **AND** the ignored decision MUST NOT bind host authority, grant permissions, activate visibility, authorize viewer-originated `signal` sends, start capture, send input, suppress host visibility, or bypass consent workflows

#### Scenario: Viewer ignores decision from mismatched observed host
- **WHEN** a viewer runtime has observed one opposite-role host peer and later receives a decoded `session-authorization-decision` for the local viewer from a different `hostPeerId`
- **THEN** the runtime MUST ignore that decision before local `received` protocol event emission
- **AND** the mismatched decision MUST NOT replace host authority, grant permissions, activate visibility, authorize viewer-originated `signal` sends, start capture, send input, suppress host visibility, or bypass consent workflows

#### Scenario: Viewer accepts decision from observed host authority
- **WHEN** a viewer runtime has observed an opposite-role host peer and receives a `session-authorization-decision` for the local viewer whose `hostPeerId` matches that observed host
- **THEN** the runtime MAY bind that host authority for the decision's authorization id without starting capture, sending input, reconnecting, hiding host visibility, or bypassing consent workflows

#### Scenario: Viewer ignores audit event before observing host authority
- **WHEN** a viewer runtime receives a decoded `audit-event` before observing an opposite-role host peer with the same peer id as the event's `actorPeerId`
- **THEN** the runtime MUST ignore that audit event before local `received` protocol event emission
- **AND** the ignored audit event MUST NOT create trusted local workflow metadata, bind host authority, grant permissions, authorize viewer-originated `signal` sends, start capture, send input, suppress host visibility, or bypass consent workflows

#### Scenario: Viewer ignores audit event from mismatched observed host
- **WHEN** a viewer runtime has observed one opposite-role host peer and later receives a decoded `audit-event` from a different `actorPeerId`
- **THEN** the runtime MUST ignore that audit event before local `received` protocol event emission
- **AND** the mismatched audit event MUST NOT replace host authority, create trusted local workflow metadata, grant permissions, authorize viewer-originated `signal` sends, start capture, send input, suppress host visibility, or bypass consent workflows

#### Scenario: Viewer accepts audit event from observed host authority
- **WHEN** a viewer runtime has observed an opposite-role host peer and receives an `audit-event` whose `actorPeerId` matches that observed host
- **THEN** the runtime MAY emit the redacted local received audit event without starting capture, sending input, reconnecting, hiding host visibility, granting permissions, or bypassing consent workflows

#### Scenario: Viewer ignores mismatched authorization authority
- **WHEN** a viewer runtime has received a `session-authorization-decision` for the local viewer from one observed host authority
- **AND** it then receives `session-authorization-state`, `permission-revoked`, or `session-control` from a different actor authority for the same session
- **THEN** the runtime MUST ignore the mismatched lifecycle message before local `received` protocol event emission
- **AND** the mismatched message MUST NOT grant, restore, pause, revoke, terminate, or otherwise alter viewer signal-send authorization

#### Scenario: Viewer ignores mismatched session-control authorization id
- **WHEN** a viewer runtime has received a host decision and active visible state for one authorization id
- **AND** it then receives `session-control` from the bound host authority with a different authorization id
- **THEN** the runtime MUST ignore the mismatched control before local `received` protocol event emission
- **AND** the mismatched control MUST NOT pause, resume, terminate, revoke, restore, or otherwise alter viewer signal-send authorization

#### Scenario: Viewer ignores legacy host consent decision
- **WHEN** a viewer runtime receives a decoded legacy `host-consent-decision` addressed to the local viewer
- **THEN** the runtime MUST ignore that legacy decision before local `received` protocol event emission
- **AND** the ignored legacy decision MUST NOT bind host authority, grant permissions, activate visibility, authorize viewer-originated `signal` sends, start capture, send input, suppress host visibility, or bypass consent workflows

#### Scenario: Viewer ignores decisions for another viewer
- **WHEN** a viewer runtime receives a `session-authorization-decision` whose `viewerPeerId` does not identify the local viewer
- **THEN** the runtime MUST ignore that decision before local `received` protocol event emission
- **AND** the ignored decision MUST NOT bind host authority or authorize viewer-originated `signal` sends

#### Scenario: Viewer denied decision remains fail-closed
- **WHEN** a viewer runtime receives a denied `session-authorization-decision` for the local viewer from the observed host authority
- **AND** it later receives an active `session-authorization-state` or `session-control` for the same authorization id and host authority
- **THEN** the runtime MUST ignore the lifecycle message before local `received` protocol event emission
- **AND** later viewer-originated `signal` sends MUST still be rejected before socket write and local `sent` event emission

#### Scenario: Viewer restart clears authorization authority binding
- **WHEN** a viewer runtime object is stopped and started again after previously observing active visible `screen:view` authorization
- **THEN** the restarted runtime MUST NOT treat the prior connection's decision, host authority, or authorization state as active
- **AND** viewer-originated `signal` sends MUST be rejected until the restarted runtime receives a new observed-host local-viewer decision and matching active visible state

#### Scenario: Ignored viewer authorization authority diagnostics are secret-safe
- **WHEN** the viewer runtime ignores an unbound or mismatched authorization lifecycle message, ignores a decision from an unobserved or mismatched host, ignores an audit event from an unobserved or mismatched host, or ignores a legacy host consent decision
- **THEN** local events and logs expose only redacted summary metadata such as byte length
- **AND** they MUST NOT expose raw protocol payloads, session ids, peer ids, authorization ids, actor ids, audit ids, audit actions, audit details, signal payloads, tokens, pairing codes, private reasons, grant scopes, keystrokes, screenshots, screen contents, or input contents
