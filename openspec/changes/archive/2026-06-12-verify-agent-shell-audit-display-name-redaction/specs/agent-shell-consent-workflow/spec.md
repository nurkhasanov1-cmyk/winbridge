## MODIFIED Requirements

### Requirement: Host workflow audit file persistence
The host shell SHALL persist local development audit records for host-generated workflow `audit-event` messages when an audit sink is configured.

#### Scenario: Host approval audit is persisted
- **WHEN** the host shell is configured with an audit sink and explicitly approves a visible authorization request
- **THEN** it writes schema-valid audit records for approval and visible activation using the host actor, session id, action, outcome, and secret-safe detail metadata

#### Scenario: Host denial audit is persisted
- **WHEN** the host shell is configured with an audit sink and explicitly denies an authorization request
- **THEN** it writes a schema-valid denied audit record without raw denial reason text

#### Scenario: Host lifecycle audit is persisted
- **WHEN** the host shell emits revocation, pause, resume, termination, or expiration workflow audit-events
- **THEN** it writes matching schema-valid audit records with the same event ids, actions, outcomes, and secret-safe details

#### Scenario: Agent shell audit file details are secret-safe
- **WHEN** host workflow audit records are persisted with private host display-name, viewer display-name, lifecycle-reason, pairing-code, signal-payload, or protocol-payload marker values present elsewhere in the workflow
- **THEN** persisted details MUST NOT contain raw tokens, raw pairing codes, credentials, display names, signal payloads, raw protocol payloads, keystrokes, screenshots, screen contents, or raw private reason text

#### Scenario: Received protocol payloads are not persisted as workflow audit
- **WHEN** the agent shell receives arbitrary protocol messages or non-protocol text
- **THEN** it does not persist those raw payloads through the host workflow audit sink

#### Scenario: Audit sink failure is surfaced
- **WHEN** the configured host workflow audit sink fails to write a record
- **THEN** the host shell surfaces the failure instead of silently dropping the audit record
