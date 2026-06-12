## ADDED Requirements

### Requirement: Testable same-role join rejection
The relay runtime SHALL expose integration-test coverage proving a second live host or second live viewer with a different `peerId` is rejected before registration, while the original same-role peer remains active.

#### Scenario: Runtime rejects second host role
- **WHEN** integration tests register a host and a second socket attempts to join the same session as another host with a different `peerId`
- **THEN** the second host socket receives a bounded relay error
- **AND** the original host remains registered and can receive forwarded peer messages

#### Scenario: Runtime rejects second viewer role
- **WHEN** integration tests register a host and viewer and a second socket attempts to join the same session as another viewer with a different `peerId`
- **THEN** the second viewer socket receives a bounded relay error
- **AND** the original viewer remains registered and can receive forwarded peer messages

#### Scenario: Runtime same-role rejection audit remains secret-safe
- **WHEN** the runtime audits a same-role join rejection
- **THEN** the audit record identifies the bounded rejection without raw pairing codes, tokens, credentials, protocol payloads, private reasons, keystrokes, screenshots, screen contents, or full secrets
