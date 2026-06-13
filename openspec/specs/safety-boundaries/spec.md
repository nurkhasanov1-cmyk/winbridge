# safety-boundaries Specification

## Purpose
Defines the consent-first safety invariants and prohibited capability boundaries that every WinBridge change must preserve.
## Requirements
### Requirement: Visible consent session
The system SHALL only permit remote assistance inside an authenticated session that is explicitly approved by the host user and visibly indicated on the host machine for the entire session.

#### Scenario: Host approves a viewer
- **WHEN** a viewer requests access to a host session
- **THEN** the host user is shown the viewer identity, requested permissions, and session controls before access is granted

#### Scenario: Host denies a viewer
- **WHEN** the host user denies a viewer request
- **THEN** the system refuses the session and does not expose screen, input, clipboard, file, or diagnostic data to the viewer

#### Scenario: Active session remains visible
- **WHEN** a remote assistance session is active
- **THEN** the host machine displays a visible session indicator and an immediate disconnect control

### Requirement: Prohibited covert capabilities
The system MUST NOT include hidden sessions, stealth installation, unauthorized persistence, credential theft, keylogging, AV/EDR evasion, Windows prompt bypass, or hidden screen/input capture.

#### Scenario: Feature requests covert access
- **WHEN** a requested feature requires hidden operation, evasion, credential collection, or bypassing user consent
- **THEN** the feature is rejected as out of scope before implementation

### Requirement: Permission-scoped remote actions
The system SHALL model every sensitive remote action as an explicit permission that is requested, granted, logged, and revocable by the host.

#### Scenario: Viewer requests keyboard input
- **WHEN** a viewer requests keyboard input control
- **THEN** the host user must approve the keyboard permission before any keyboard input message can be accepted by the host client

#### Scenario: Host revokes access
- **WHEN** the host revokes a granted permission or terminates the session
- **THEN** the system stops processing the revoked remote actions immediately

### Requirement: Auditability
The system SHALL record security-relevant session events in an audit stream that can be inspected during development and later persisted for production.

#### Scenario: Session lifecycle audit
- **WHEN** a session is requested, approved, denied, revoked, paused, resumed, or terminated
- **THEN** the system emits an audit event with timestamp, actor, session id, action, and outcome

### Requirement: Permission vocabulary excludes covert and high-risk administrative scopes
The system SHALL keep covert permission names and high-risk administrative or native permission names out of the current remote-assistance authorization vocabulary. Permission names implying hidden sessions, stealth installation, unauthorized persistence, credential access or theft, keylogging, AV/EDR evasion, Windows prompt bypass, remote shell, unattended access, service installation, startup persistence, privilege elevation, installer behavior, or native Windows administration MUST be rejected unless a future OpenSpec change and security review explicitly define a legitimate consent-first capability; permanently prohibited covert, credential theft, keylogging, evasion, and prompt-bypass capabilities MUST remain rejected.

#### Scenario: Covert permission shape is rejected
- **WHEN** a viewer, host, protocol message, or authorization record attempts to use a permission name shaped like hidden access, stealth, credential access, keylogging, evasion, or prompt bypass
- **THEN** the system rejects the permission before creating, granting, forwarding, restoring, revoking, or authorizing access

#### Scenario: High-risk administrative permission shape requires future review
- **WHEN** a viewer, host, protocol message, or authorization record attempts to use a permission name shaped like remote shell, unattended access, service installation, startup persistence, installer behavior, privilege elevation, or native Windows administration before an explicit approved OpenSpec change exists
- **THEN** the system rejects the permission before creating, granting, forwarding, restoring, revoking, or authorizing access

### Requirement: Clipboard access requires explicit capability review

The system SHALL keep clipboard read and clipboard write access out of the
current remote-assistance authorization vocabulary until a future OpenSpec
change and security review explicitly define legitimate consent-first clipboard
behavior, including host consent text, visible active-session indication,
revocation, audit events, abuse cases, and data-handling requirements.

#### Scenario: Clipboard permission shape is rejected

- **WHEN** a viewer, host, protocol message, CLI option, runtime option, authorization record, or consent-bound grant attempts to use `clipboard:read` or `clipboard:write`
- **THEN** the system rejects the permission before creating, granting, forwarding, restoring, revoking, or authorizing access
- **AND** rejection MUST NOT expose clipboard contents, start capture, send input, reconnect peers, suppress host visibility, or bypass consent workflows

### Requirement: File transfer requires explicit capability review

The system SHALL keep file-transfer access out of the current remote-assistance
authorization vocabulary until a future OpenSpec change and security review
explicitly define legitimate consent-first file-transfer behavior, including
host consent text, visible active-session indication, revocation, audit events,
path and content redaction, abuse cases, and data-handling requirements.

#### Scenario: File-transfer permission shape is rejected

- **WHEN** a viewer, host, protocol message, CLI option, runtime option, authorization record, or consent-bound grant attempts to use `file-transfer`
- **THEN** the system rejects the permission before creating, granting, forwarding, restoring, revoking, or authorizing access
- **AND** rejection MUST NOT expose file contents, transfer files, start capture, send input, reconnect peers, suppress host visibility, or bypass consent workflows
