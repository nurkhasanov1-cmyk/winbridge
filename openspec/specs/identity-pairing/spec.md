# identity-pairing Specification

## Purpose
Defines device identity and host-created pairing ticket requirements for development session joins without granting remote permissions.
## Requirements
### Requirement: Local device identity
The system SHALL represent each connecting peer with schema-validated local device identity metadata that is distinct from production account authentication, and device identity display names SHALL be non-blank, already trimmed, 120 characters or less, contain no ASCII control characters, and contain no Unicode bidirectional or zero-width formatting controls before use.

#### Scenario: Peer includes device identity
- **WHEN** a peer joins a session with device identity metadata
- **THEN** the receiver validates device id, display name, platform, and trust level before using the metadata

#### Scenario: Device identity display name is blank
- **WHEN** a peer sends device identity metadata with an empty or whitespace-only display name
- **THEN** the receiver rejects the malformed metadata without treating the peer as authenticated

#### Scenario: Device identity display name is untrimmed
- **WHEN** a peer sends device identity metadata with a display name that has leading or trailing whitespace
- **THEN** the receiver rejects the malformed metadata without treating the peer as authenticated

#### Scenario: Device identity display name contains ASCII control characters
- **WHEN** a peer sends device identity metadata with a display name that contains an ASCII control character
- **THEN** the receiver rejects the malformed metadata without treating the peer as authenticated

#### Scenario: Device identity display name contains Unicode formatting controls
- **WHEN** a peer sends device identity metadata with a display name that contains a Unicode bidirectional or zero-width formatting control including `U+FEFF`
- **THEN** the receiver rejects the malformed metadata without treating the peer as authenticated

#### Scenario: Device identity display-name rejection remains non-authorizing
- **WHEN** device identity display-name metadata is rejected
- **THEN** the rejection MUST NOT approve a session, activate host visibility, grant permissions, start capture, send input, reconnect a peer, or bypass consent workflows

#### Scenario: Device identity is malformed
- **WHEN** a peer sends malformed device identity metadata
- **THEN** the receiver rejects the malformed metadata without treating the peer as authenticated

### Requirement: Identity and pairing records reject unknown fixed fields
The system SHALL reject unknown fields on device identity, pairing ticket, and paired-device records before treating those records as trusted identity or pairing metadata.

#### Scenario: Device identity has unknown fixed field
- **WHEN** a peer sends device identity metadata with an unknown field
- **THEN** the receiver MUST reject the malformed metadata without treating the peer as authenticated

#### Scenario: Pairing ticket has unknown fixed field
- **WHEN** a pairing ticket record includes an unknown field
- **THEN** the pairing layer MUST reject the ticket before consuming it or authorizing session access

#### Scenario: Paired-device record has unknown fixed field
- **WHEN** a paired-device record includes an unknown field
- **THEN** the system MUST reject the record before using it as a pairing relationship

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

### Requirement: Pairing code hash verification is constant-time
The system SHALL verify valid stored pairing-code hashes against valid candidate pairing-code hashes using a fixed-length constant-time comparison. A mismatch MUST fail closed without decrementing ticket uses, registering a peer, granting remote permissions, activating host visibility, starting capture, sending input, reconnecting peers, or exposing raw pairing codes, salted hashes, credentials, protocol payloads, keystrokes, screenshots, screen contents, or full secrets.

#### Scenario: Matching pairing code consumes ticket
- **WHEN** a viewer presents the pairing code that matches a valid unexpired ticket with remaining uses
- **THEN** the pairing layer accepts the match and decrements remaining uses exactly once

#### Scenario: Mismatched pairing code fails closed
- **WHEN** a viewer presents a different validly formatted pairing code for a valid unexpired ticket with remaining uses
- **THEN** the pairing layer rejects the match without decrementing remaining uses or granting remote access
- **AND** the rejection MUST NOT expose raw pairing codes or salted hash material

#### Scenario: Malformed stored hash is rejected before trust
- **WHEN** a pairing ticket record carries a malformed stored pairing-code hash
- **THEN** the pairing layer rejects the ticket before comparing or consuming it
- **AND** the rejection MUST NOT grant permissions, approve authorization, start capture, send input, reconnect peers, suppress host visibility, or bypass consent workflows

### Requirement: Pairing does not grant remote access
The system SHALL treat successful pairing as a prerequisite identity relationship only, not as approval for screen viewing, input, clipboard, file transfer, diagnostics, reconnect, hidden sessions, or consent bypass. A paired-device record created from a pairing ticket MUST be recorded only at or after the ticket creation time and before the ticket expiration time.

#### Scenario: Pairing succeeds
- **WHEN** a viewer successfully consumes a valid pairing ticket at or after the ticket creation time and before the ticket expiration time
- **THEN** the system records the pair relationship without granting remote session permissions

#### Scenario: Pairing before ticket creation is rejected
- **WHEN** code attempts to create a paired-device record with `pairedAt` before the source ticket `createdAt`
- **THEN** the pairing layer rejects the record before using it as trusted pairing metadata
- **AND** the rejection MUST NOT grant permissions, approve authorization, start capture, send input, reconnect peers, suppress host visibility, or bypass consent workflows

#### Scenario: Pairing at ticket expiration is rejected
- **WHEN** code attempts to create a paired-device record with `pairedAt` at or after the source ticket `expiresAt`
- **THEN** the pairing layer rejects the record before using it as trusted pairing metadata
- **AND** the rejection MUST NOT expose raw pairing codes, credentials, protocol payloads, keystrokes, screenshots, screen contents, or full secrets

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

### Requirement: Replacement host pairing scope is fresh
The development relay SHALL tie host-created pairing tickets to the current live host room lifecycle. When a host disconnects, any viewer paired under that host's ticket MUST NOT be reused as a paired viewer for a later replacement host. The replacement host's pairing ticket MUST be consumed by a viewer join or rejoin before the relay treats the replacement host and viewer as a paired room.

#### Scenario: Stale viewer cannot consume replacement pairing implicitly
- **WHEN** a viewer consumed a previous host pairing ticket and the previous host disconnects
- **THEN** the viewer's previous paired state MUST NOT satisfy the replacement host's pairing ticket

#### Scenario: Replacement host pairing is consumed by rejoin
- **WHEN** the replacement host creates a new relay pairing ticket and a viewer joins with that current pairing credential
- **THEN** the relay consumes the replacement host's ticket before registering the viewer in the replacement room

### Requirement: Duplicate relay joins do not mutate pairing state
The development relay SHALL reject duplicate live peer-id joins before host pairing-ticket creation, viewer pairing-ticket consumption, paired-device recording, or peer send-path replacement.

#### Scenario: Duplicate host join does not refresh pairing ticket
- **WHEN** a host is already registered in a relay session and another socket attempts to join with the same host `peerId`
- **THEN** the relay rejects the duplicate host join before creating or replacing host pairing material
- **AND** the original host remains registered

#### Scenario: Duplicate viewer join does not consume pairing ticket
- **WHEN** a viewer is already registered in a relay session and another socket attempts to join with the same viewer `peerId`
- **THEN** the relay rejects the duplicate viewer join before consuming pairing material or recording a new paired device
- **AND** the original viewer remains registered

### Requirement: Device identity rejects secret-bearing display names
The identity layer SHALL reject device identity display names that contain secret-bearing metadata before treating the identity as trusted peer metadata. Secret-bearing metadata MUST include raw token, credential, password, passphrase, pairing-code, API-key, authorization-header, auth-header, cookie, private-key, SSH-key, keystroke, screenshot, screen-data, screen-content, clipboard-content, file-transfer content/data/bytes, diagnostics content/dump, or secret markers when they appear with values. Rejection diagnostics MUST NOT expose the raw display-name text.

#### Scenario: Device identity display name contains secret-bearing metadata
- **WHEN** a peer sends device identity metadata whose display name contains secret-bearing metadata
- **THEN** the receiver rejects the malformed metadata without treating the peer as authenticated
- **AND** the rejection does not expose the raw display-name text

#### Scenario: Safe device identity display name remains accepted
- **WHEN** a peer sends device identity metadata with a concise non-secret display name
- **THEN** the identity schema accepts the display name when all other identity metadata is valid
