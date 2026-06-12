## MODIFIED Requirements

### Requirement: Two-party relay room
The relay SHALL limit each development session room to one host peer and one viewer peer unless a future OpenSpec change introduces multi-viewer semantics.

#### Scenario: Third peer attempts to join
- **WHEN** a session room already contains a host and a viewer
- **THEN** the relay rejects additional peers for that room

#### Scenario: Second host attempts to join
- **WHEN** a session room already contains a live host and another socket attempts to join the same session as a host with a different `peerId`
- **THEN** the relay rejects the second host before registration
- **AND** the original host remains the registered host

#### Scenario: Second viewer attempts to join
- **WHEN** a session room already contains a live viewer and another socket attempts to join the same session as a viewer with a different `peerId`
- **THEN** the relay rejects the second viewer before registration
- **AND** the original viewer remains the registered viewer
