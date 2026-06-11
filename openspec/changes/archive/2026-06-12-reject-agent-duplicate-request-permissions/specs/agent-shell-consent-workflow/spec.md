## MODIFIED Requirements

### Requirement: CLI argument validation
The agent shell SHALL reject malformed CLI arguments for safety-sensitive fields before opening a relay connection, including unknown options, duplicate options, duplicate requested permissions, missing values, malformed relay URLs, malformed identifiers, malformed display names, malformed permissions, malformed pairing codes, malformed lifecycle reasons, blank relay tokens, blank audit log paths, and malformed visible-session values.

#### Scenario: Malformed permission is rejected
- **WHEN** the agent shell is started with an invalid requested or revocation permission value
- **THEN** argument parsing fails before a relay connection is opened

#### Scenario: Duplicate requested permission is rejected
- **WHEN** the agent shell is started with the same requested permission more than once
- **THEN** argument parsing fails before a relay connection is opened or a session authorization request is sent

#### Scenario: Unknown option is rejected
- **WHEN** the agent shell is started with an unknown CLI option
- **THEN** argument parsing fails before a relay connection is opened
