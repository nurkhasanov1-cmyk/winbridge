## ADDED Requirements

### Requirement: Agent shell file audit configuration
The agent shell SHALL use the development JSONL file audit sink when an audit log path is configured for local workflow audit persistence.

#### Scenario: Agent shell audit path is configured by CLI
- **WHEN** the agent shell starts with an explicit audit log path
- **THEN** host workflow audit records are written to that JSONL file through the shared file audit sink

#### Scenario: Agent shell audit path is configured by environment
- **WHEN** the agent shell starts with `WINBRIDGE_AGENT_AUDIT_LOG_PATH`
- **THEN** host workflow audit records are written to that JSONL file through the shared file audit sink

#### Scenario: Agent shell audit path is omitted
- **WHEN** the agent shell starts without an audit log path
- **THEN** it does not create a local audit file and continues to emit protocol audit-event messages when configured workflow events occur

#### Scenario: Agent shell file audit redacts sensitive detail
- **WHEN** an agent shell workflow audit record is written to the configured file
- **THEN** the persisted JSON line is schema-valid and contains redacted placeholders instead of raw sensitive values if any sensitive detail key is present
