## ADDED Requirements

### Requirement: Runtime rejects secret-bearing audit-event actions before forwarding
The relay runtime SHALL reject registered peer `audit-event` messages whose `action` contains secret-bearing metadata before forwarding to another peer. The sender SHALL receive only a bounded secret-safe relay error, and relay audit records MUST NOT include the raw action text, raw tokens, raw pairing codes, credentials, authorization headers, cookies, key material, remote-content payloads, diagnostics dumps, protocol payloads, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents/data/bytes, or full secrets.

#### Scenario: Runtime rejects secret-bearing audit-event action before forwarding
- **WHEN** integration tests register a host and viewer, then one peer sends an `audit-event` with a secret-bearing `action`
- **THEN** the sender receives a bounded relay error reason and the remaining peer receives no forwarded `audit-event` message
- **AND** the relay rejection audit record MUST NOT expose the raw action text or secret marker value
