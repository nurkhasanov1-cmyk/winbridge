## ADDED Requirements

### Requirement: Viewer terminal decision replay boundary
The viewer runtime SHALL ignore inbound `session-authorization-decision` messages before local `received` protocol event emission when they target the same authorization id and observed host authority as a terminal viewer authorization snapshot. Terminal same-authorization decision replay MUST NOT replace host authority, restore permissions, activate visibility, authorize viewer-originated `signal` sends, start capture, send input, reconnect, suppress host visibility, or bypass consent workflows. A different authorization id from the observed host authority SHALL remain a new consent scope.

#### Scenario: Denied authorization cannot be reopened by same-id approved decision
- **WHEN** a viewer runtime receives a denied `session-authorization-decision` for the local viewer from the observed host authority
- **AND** it later receives an approved `session-authorization-decision` for the same authorization id and host authority
- **THEN** the runtime MUST ignore the later decision before local `received` protocol event emission
- **AND** later same-id active state MUST still be ignored before local `received` protocol event emission
- **AND** viewer-originated `signal` sends MUST remain rejected before socket write and local `sent` event emission

#### Scenario: Terminal state cannot be reopened by same-id approved decision
- **WHEN** a viewer runtime has observed `revoked`, `terminated`, or `expired` authorization state for an authorization id from the observed host authority
- **AND** it later receives an approved `session-authorization-decision` for the same authorization id and host authority
- **THEN** the runtime MUST ignore the later decision before local `received` protocol event emission
- **AND** later same-id active state MUST still be ignored before local `received` protocol event emission
- **AND** viewer-originated `signal` sends MUST remain rejected before socket write and local `sent` event emission

#### Scenario: New authorization id remains a new consent scope
- **WHEN** a viewer runtime has a terminal authorization snapshot for one authorization id from the observed host authority
- **AND** it later receives an approved `session-authorization-decision` and active visible `session-authorization-state` for a different authorization id from that observed host authority
- **THEN** the new authorization id MAY bind as a new consent scope
- **AND** the previous terminal authorization id MUST NOT restore, remove, or otherwise modify permissions for the new authorization id

#### Scenario: Terminal decision replay diagnostics remain secret-safe
- **WHEN** the viewer runtime ignores a terminal same-authorization decision replay
- **THEN** local events and logs MUST NOT expose raw protocol payloads, tokens, pairing codes, private reasons, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents, diagnostics dumps, or input contents
