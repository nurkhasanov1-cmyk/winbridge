## ADDED Requirements

### Requirement: Testable viewer revoke confirmation fail-closed behavior
The agent shell SHALL expose integration-test coverage proving a viewer accepts a same-authority `permission-revoked` confirmation after a bound revoke-permission `session-control` without restoring signal authorization.

#### Scenario: Viewer receives revoke confirmation after revoke control
- **WHEN** a viewer runtime has active visible `screen:view` authorization, receives a same-authority revoke-permission `session-control`, and then receives a same-authority `permission-revoked` confirmation for the same authorization id and permission
- **THEN** the viewer runtime emits the confirmation as a local `received` protocol event with secret-safe reason metadata
- **AND** viewer-originated `signal` sends remain rejected before socket write and local `sent` event emission

#### Scenario: Revoke confirmation diagnostics remain secret-safe
- **WHEN** the viewer runtime receives the follow-up `permission-revoked` confirmation with private reason text
- **THEN** local events and logs MUST NOT expose raw reason text, raw protocol payloads, tokens, pairing codes, credentials, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents, diagnostics dumps, or input contents
