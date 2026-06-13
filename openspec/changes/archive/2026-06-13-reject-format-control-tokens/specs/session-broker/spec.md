## MODIFIED Requirements

### Requirement: Development relay token
The relay SHALL support an optional shared token for local/private development and SHALL document that production deployments require stronger identity and authorization. When a shared token is configured, it MUST be non-blank, already trimmed, 1024 UTF-8 bytes or less, contain no ASCII control characters, contain no Unicode bidirectional formatting controls, contain no zero-width formatting controls, and peers MUST present exactly one canonical lowercase `token` query parameter whose value exactly matches the configured shared token before joining a session room. Query parameter names whose ASCII case-insensitive form is `token` but whose exact spelling is not lowercase `token` MUST be treated as token-bearing and invalid. When a shared token is not configured, peers MUST NOT present any canonical or case-variant `token` query parameter and the relay MUST reject token-bearing connections before joining a session room.

#### Scenario: Shared token configured
- **WHEN** the relay is started with a shared token
- **THEN** peers without exactly one matching canonical lowercase `token` parameter are rejected before joining a session room

#### Scenario: Duplicate shared token query is rejected
- **WHEN** the relay is started with a shared token and a peer connects with more than one canonical or case-variant `token` query parameter
- **THEN** the peer is rejected before joining a session room

#### Scenario: Case-variant shared token query is rejected
- **WHEN** the relay is started with a shared token and a peer connects with `Token`, `TOKEN`, or another case-variant spelling of the `token` query parameter
- **THEN** the peer is rejected before joining a session room even if the presented value matches the configured shared token
- **AND** the relay MUST NOT store, forward, echo, log, or audit the raw configured token or raw presented token value

#### Scenario: Padded shared token query is rejected
- **WHEN** the relay is started with a trimmed shared token and a peer connects with a token query value containing leading or trailing whitespace
- **THEN** the peer is rejected before joining a session room because exact token comparison fails
- **AND** the relay MUST NOT store, forward, echo, log, or audit the raw configured token or raw presented token value

#### Scenario: Shared token omitted
- **WHEN** the relay is started without a shared token
- **THEN** the relay starts in development mode and logs a warning that it is not production authorization

#### Scenario: Token query rejected when shared token omitted
- **WHEN** the relay is started without a shared token and a peer connects with one or more canonical or case-variant `token` query parameters
- **THEN** the peer is rejected before joining a session room
- **AND** the relay MUST NOT store, forward, echo, or audit the raw presented token value

#### Scenario: Malformed shared token is rejected
- **WHEN** the relay is configured with an empty, whitespace-only, non-string, untrimmed, control-character, Unicode bidirectional formatting control, zero-width formatting control, or oversized shared token
- **THEN** the relay rejects the configuration before accepting peer connections
