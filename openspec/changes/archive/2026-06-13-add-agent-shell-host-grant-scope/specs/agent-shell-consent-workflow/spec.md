## ADDED Requirements

### Requirement: Host grant scope CLI validation
The agent shell SHALL reject malformed, viewer-mode, or ambiguous host grant scope CLI configuration before starting the runtime. Host grant scope validation SHALL allow only exact comma-separated canonical permission names for host runtimes with an approval source. Configured grant scope MUST be non-empty and MUST NOT contain duplicate permissions.

#### Scenario: Host grant scope is configured with static approval
- **WHEN** the host shell is started with `--host-decision approve --grant screen:view`
- **THEN** CLI validation succeeds and the grant scope is available to the runtime

#### Scenario: Host grant scope is configured with interactive approval
- **WHEN** the host shell is started with `--host-consent-prompt true --grant screen:view`
- **THEN** CLI validation succeeds and the grant scope is available if the host later approves

#### Scenario: Host grant scope is host-only
- **WHEN** a viewer shell is started with `--grant screen:view`
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Host grant scope requires approval source
- **WHEN** a host shell is started with `--grant screen:view` but without static approval or interactive host consent prompt mode
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

#### Scenario: Host grant scope rejects duplicate permissions
- **WHEN** the shell is started with `--grant screen:view,screen:view`
- **THEN** it exits through bounded usage handling before connecting to the relay or sending any protocol message

### Requirement: Host grant scope approval
The host agent shell SHALL support an explicit development grant scope for approvals. When configured, approved host decisions MUST grant exactly the configured non-empty permission subset and MUST NOT grant unrequested permissions. If the configured grant scope is not a subset of the current viewer request, the host shell MUST fail closed before emitting approval, active state, session-control, permission-revoked, signal, or workflow audit messages for that request. This development option MUST NOT authorize screen capture, input, clipboard access, file transfer, diagnostics, reconnect, hidden sessions, stealth persistence, or consent bypass.

#### Scenario: Host approves narrower requested scope
- **WHEN** a viewer requests `screen:view,input:pointer`
- **AND** the host shell is configured to approve with grant scope `screen:view`
- **THEN** the host sends an approved decision and visible active state with only `screen:view`
- **AND** approval and activation audit metadata report one granted permission

#### Scenario: Host approval omits screen view
- **WHEN** a viewer requests `screen:view,input:pointer`
- **AND** the host shell is configured to approve with grant scope `input:pointer`
- **THEN** the host sends an approved decision and visible active state with only `input:pointer`
- **AND** signal authorization remains unavailable because `screen:view` was not granted

#### Scenario: Host configured grant includes unrequested permission
- **WHEN** a viewer requests `screen:view`
- **AND** the host shell is configured to approve with grant scope `input:pointer`
- **THEN** the host MUST NOT emit approval, active state, session-control, permission-revoked, signal, or workflow audit messages for that request
- **AND** it logs only a secret-safe skip reason

#### Scenario: Host grant scope drives revocation eligibility
- **WHEN** the host approves a narrowed grant scope that excludes `input:pointer`
- **AND** delayed or direct revocation is configured for `input:pointer`
- **THEN** the host MUST NOT emit revoke session-control, permission-revoked, revoked state, or revocation audit messages for `input:pointer`

#### Scenario: Host grant scope diagnostics are secret-safe
- **WHEN** host grant scope validation, approval, subset checks, or skips occur
- **THEN** CLI errors, runtime events, audit details, and logs MUST NOT expose raw protocol payloads, tokens, pairing codes, private reasons, display names, signal payloads, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents, diagnostics dumps, or input contents
