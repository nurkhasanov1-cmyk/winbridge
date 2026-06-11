## ADDED Requirements

### Requirement: Testable registered peer authority
The relay runtime SHALL expose integration-test coverage proving registered peers cannot forward join-only, relay-originated, spoofed sender/actor, or role-mismatched authorization messages.

#### Scenario: Runtime rejects registered join replay
- **WHEN** integration tests register a host and viewer, then a registered peer sends another `join-session` message
- **THEN** the sender receives a bounded relay error and the remaining peer receives no forwarded `join-session` message

#### Scenario: Runtime rejects relay-only message forgery
- **WHEN** integration tests register a host and viewer, then a registered peer sends `relay-ready` or `peer-disconnected` as a normal message
- **THEN** the sender receives a bounded relay error and the remaining peer receives no forwarded relay-only message

#### Scenario: Runtime rejects sender spoofing
- **WHEN** integration tests register a host and viewer, then one peer sends a message declaring the other peer as its sender or actor
- **THEN** the sender receives a bounded relay error and the remaining peer receives no forwarded spoofed message

#### Scenario: Runtime rejection audit remains secret-safe
- **WHEN** the runtime audits a registered-peer message authority rejection
- **THEN** the audit record identifies the rejection without raw pairing codes, tokens, credentials, protocol payloads, keystrokes, screenshots, screen contents, or full secrets
