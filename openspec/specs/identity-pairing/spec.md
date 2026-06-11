# identity-pairing Specification

## Purpose
Defines device identity and host-created pairing ticket requirements for development session joins without granting remote permissions.
## Requirements
### Requirement: Local device identity
The system SHALL represent each connecting peer with schema-validated local device identity metadata that is distinct from production account authentication.

#### Scenario: Peer includes device identity
- **WHEN** a peer joins a session with device identity metadata
- **THEN** the receiver validates device id, display name, platform, and trust level before using the metadata

#### Scenario: Device identity is malformed
- **WHEN** a peer sends malformed device identity metadata
- **THEN** the receiver rejects the malformed metadata without treating the peer as authenticated

### Requirement: Expiring pairing ticket
The system SHALL model pairing material as an expiring, replay-resistant ticket that stores a per-ticket salted hash of the pairing code instead of the raw code, and SHALL reject malformed or unsafe pairing ticket factory TTL and max-use inputs before creating ticket records.

#### Scenario: Pairing ticket is created
- **WHEN** the host creates pairing material for a session
- **THEN** the resulting ticket contains session id, host device id, pairing-code salt, salted pairing-code hash, creation time, expiration time, and remaining uses

#### Scenario: Pairing ticket is expired
- **WHEN** a peer attempts to use a pairing ticket after its expiration time
- **THEN** the system rejects the ticket before authorizing session access

#### Scenario: Pairing ticket omits raw secret
- **WHEN** a pairing ticket is serialized or audited
- **THEN** the raw pairing code is not present in the ticket or audit details

#### Scenario: Same code creates different ticket hashes
- **WHEN** two pairing tickets are created with the same raw pairing code
- **THEN** each ticket has a distinct pairing-code salt and salted pairing-code hash

#### Scenario: Pairing ticket factory values are omitted
- **WHEN** a pairing ticket is created without explicit TTL or maximum-use values
- **THEN** the system uses the default expiration window and default remaining use count

#### Scenario: Pairing ticket TTL is malformed
- **WHEN** a pairing ticket is created with a fractional, negative, non-finite, or timer-unsafe TTL value
- **THEN** the system rejects the request before creating a ticket record

#### Scenario: Pairing ticket max uses is malformed
- **WHEN** a pairing ticket is created with a fractional, non-positive, non-finite, or out-of-range max-use value
- **THEN** the system rejects the request before creating a ticket record

### Requirement: Pairing ticket consumption
The system SHALL decrement remaining pairing ticket uses and reject tickets after all allowed uses are consumed.

#### Scenario: Ticket has remaining uses
- **WHEN** a valid ticket is consumed
- **THEN** the remaining use count decreases and the ticket remains valid only if uses remain and expiration has not passed

#### Scenario: Ticket has no remaining uses
- **WHEN** a ticket with zero remaining uses is consumed
- **THEN** the system rejects the ticket before authorizing session access

### Requirement: Pairing does not grant remote access
The system SHALL treat successful pairing as a prerequisite identity relationship only, not as approval for screen viewing, input, clipboard, file transfer, or diagnostics.

#### Scenario: Pairing succeeds
- **WHEN** a viewer successfully consumes a valid pairing ticket
- **THEN** the system records the pair relationship without granting remote session permissions

#### Scenario: Viewer requests remote action after pairing
- **WHEN** a paired viewer requests screen, input, clipboard, file, or diagnostic access without a host-approved active session grant
- **THEN** the system denies the action

### Requirement: Development relay pairing ticket lifecycle
The development relay SHALL use host-created expiring pairing tickets with per-ticket salted pairing-code hashes for viewer room joins and SHALL NOT store raw pairing codes in relay peer state.

#### Scenario: Host creates relay pairing ticket
- **WHEN** a host joins a relay session with a pairing credential
- **THEN** the relay creates an in-memory pairing ticket containing the session id, host device id, pairing-code salt, salted pairing-code hash, creation time, expiration time, and remaining uses

#### Scenario: Viewer consumes relay pairing ticket
- **WHEN** a viewer joins with the matching pairing credential before the ticket expires and while uses remain
- **THEN** the relay consumes one ticket use before registering the viewer in the room

#### Scenario: Viewer presents mismatched credential
- **WHEN** a viewer joins with a pairing credential that does not match the host-created ticket
- **THEN** the relay rejects the join before registering the viewer and does not expose the raw credential in audit output

#### Scenario: Viewer presents expired credential
- **WHEN** a viewer joins after the host-created pairing ticket expires
- **THEN** the relay rejects the join before registering the viewer

#### Scenario: Viewer presents consumed credential
- **WHEN** a viewer joins after the host-created pairing ticket has no remaining uses
- **THEN** the relay rejects the join before registering the viewer

#### Scenario: Pairing does not grant remote action access
- **WHEN** a viewer successfully consumes a relay pairing ticket
- **THEN** the relay treats the viewer as joined only and does not grant screen, input, clipboard, file, diagnostic, or other sensitive action permissions
