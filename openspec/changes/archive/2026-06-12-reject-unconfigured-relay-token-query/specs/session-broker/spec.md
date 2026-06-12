## MODIFIED Requirements

### Requirement: Development relay token
The relay SHALL support an optional shared token for local/private development and SHALL document that production deployments require stronger identity and authorization. When a shared token is configured, it MUST be non-blank, 1024 UTF-8 bytes or less, contain no ASCII control characters, and peers MUST present exactly one `token` query parameter whose value exactly matches the configured shared token before joining a session room. When a shared token is not configured, peers MUST NOT present any `token` query parameter and the relay MUST reject token-bearing connections before joining a session room.

#### Scenario: Shared token configured
- **WHEN** the relay is started with a shared token
- **THEN** peers without exactly one matching token are rejected before joining a session room

#### Scenario: Duplicate shared token query is rejected
- **WHEN** the relay is started with a shared token and a peer connects with more than one `token` query parameter
- **THEN** the peer is rejected before joining a session room

#### Scenario: Shared token omitted
- **WHEN** the relay is started without a shared token
- **THEN** the relay starts in development mode and logs a warning that it is not production authorization

#### Scenario: Token query rejected when shared token omitted
- **WHEN** the relay is started without a shared token and a peer connects with one or more `token` query parameters
- **THEN** the peer is rejected before joining a session room
- **AND** the relay MUST NOT store, forward, echo, or audit the raw presented token value

#### Scenario: Malformed shared token is rejected
- **WHEN** the relay is configured with an empty, whitespace-only, non-string, control-character, or oversized shared token
- **THEN** the relay rejects the configuration before accepting peer connections
