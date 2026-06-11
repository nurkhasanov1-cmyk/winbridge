## MODIFIED Requirements

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
