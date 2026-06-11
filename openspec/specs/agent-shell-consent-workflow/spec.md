# agent-shell-consent-workflow Specification

## Purpose
Defines the non-native agent shell workflow for exercising consent, visible activation, and revocation protocol behavior without implementing remote actions.
## Requirements
### Requirement: Managed agent shell lifecycle
The agent shell SHALL expose a managed runtime with explicit start and stop operations for tests and CLI use.

#### Scenario: Agent shell starts
- **WHEN** the agent shell runtime starts
- **THEN** it connects to the relay, sends a join message, and sends hello using the same implementation as the CLI

### Requirement: Viewer authorization request
The viewer shell SHALL send a session authorization request only when requested permissions are explicitly configured.

#### Scenario: Viewer requests screen view
- **WHEN** the viewer shell is started with requested `screen:view` permission
- **THEN** it sends a `session-authorization-request` message after joining the relay

### Requirement: Explicit host decision
The host shell SHALL NOT approve or deny authorization requests unless an explicit host decision is configured.

#### Scenario: Host decision omitted
- **WHEN** the host shell receives an authorization request and no host decision is configured
- **THEN** it logs the request without sending an approval or denial

#### Scenario: Host approves request
- **WHEN** the host shell receives an authorization request and is explicitly configured to approve with visible session state
- **THEN** it sends an approved decision and active visible state update

### Requirement: Visible active state gate
The host shell MUST NOT emit active session state unless visible session state is explicitly configured.

#### Scenario: Host approves without visible session flag
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it sends no active state update

### Requirement: Host permission revoke simulation
The host shell SHALL send permission revocation messages only when revocation is explicitly configured and the host has already emitted an active visible session state for the same authorization.

#### Scenario: Host revokes granted permission after visible activation
- **WHEN** the host shell is explicitly configured to approve, visible session state is true, and a revoke delay and permission are configured
- **THEN** it sends an approved decision, sends active visible state, sends `permission-revoked` for the configured permission after the delay, and sends an updated authorization state without that permission

#### Scenario: Host revokes final granted permission
- **WHEN** the configured revoked permission is the only granted permission
- **THEN** the updated authorization state has status `revoked` and an empty permission list

#### Scenario: Revoke configured without visible activation
- **WHEN** the host shell is configured to approve but visible session state is false
- **THEN** it does not send `permission-revoked` and does not send an active or revoked state update

#### Scenario: Revoke simulation safety boundary
- **WHEN** the host shell sends revoke simulation messages
- **THEN** it MUST NOT start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, or hide the session from the host

#### Scenario: Revoke simulation logging safety boundary
- **WHEN** the agent shell logs received protocol or non-protocol messages during revoke simulation
- **THEN** it MUST log only message summaries and MUST NOT log raw protocol payloads, raw non-protocol text, raw tokens, raw pairing codes, credentials, keystrokes, screenshots, or screen contents

### Requirement: Host workflow audit-event simulation
The host shell SHALL emit secret-safe development `audit-event` protocol messages for explicit host authorization decisions, visible activation, and permission revocation simulation.

#### Scenario: Host approval audit event
- **WHEN** the host shell explicitly approves an authorization request
- **THEN** it sends an `audit-event` with accepted outcome and safe approval metadata

#### Scenario: Host denial audit event
- **WHEN** the host shell explicitly denies an authorization request
- **THEN** it sends an `audit-event` with denied outcome and safe denial metadata

#### Scenario: Visible activation audit event
- **WHEN** the host shell emits active visible session state
- **THEN** it sends an `audit-event` with accepted outcome and visible host metadata

#### Scenario: Permission revoke audit event
- **WHEN** the host shell sends a configured permission revocation
- **THEN** it sends an `audit-event` with accepted outcome, revoked permission identifier, and remaining permission count

#### Scenario: Agent shell audit-event details are secret-safe
- **WHEN** the host shell sends development audit-event messages
- **THEN** audit details MUST NOT contain raw tokens, raw pairing codes, credentials, display names, signal payloads, keystrokes, screenshots, screen contents, or raw denial/revocation reason text
