## ADDED Requirements

### Requirement: Agent-shell rejects secret-bearing display names
The agent shell SHALL reject CLI, direct runtime, inbound `hello`, and public-send `hello` display-name values that contain secret-bearing metadata before opening a relay connection, sending `join-session`, sending `hello`, emitting trusted local protocol events, writing workflow audit records, running consent workflow handling, or rendering host-facing consent prompt identity metadata. Secret-bearing metadata MUST include raw token, credential, password, passphrase, pairing-code, API-key, authorization-header, auth-header, cookie, private-key, SSH-key, keystroke, screenshot, screen-data, screen-content, clipboard-content, file-transfer content/data/bytes, diagnostics content/dump, or secret markers when they appear with values. Rejection diagnostics, runtime events, logs, usage output, and audit records MUST NOT expose the raw display-name text.

#### Scenario: CLI display name contains secret-bearing metadata
- **WHEN** the agent-shell CLI is started with `--name` containing secret-bearing metadata
- **THEN** argument parsing fails before the runtime starts or connects to a relay
- **AND** usage handling does not expose the raw display-name text

#### Scenario: Direct runtime display name contains secret-bearing metadata
- **WHEN** caller code creates a managed runtime with a display name containing secret-bearing metadata
- **THEN** the runtime rejects the options before opening a relay connection or sending any protocol message
- **AND** thrown errors, runtime events, logs, and audit records do not expose the raw display-name text

#### Scenario: Inbound hello display name contains secret-bearing metadata
- **WHEN** the runtime receives a `hello`-shaped payload whose display name contains secret-bearing metadata
- **THEN** it treats the input as malformed raw protocol data before trusted local events or workflow handling
- **AND** runtime events and logs do not expose the raw display-name text

#### Scenario: Public hello display name contains secret-bearing metadata
- **WHEN** caller code invokes public runtime `send()` with a same-session `hello` whose display name contains secret-bearing metadata
- **THEN** the runtime rejects the send before socket write or trusted local `sent` events
- **AND** thrown errors, runtime events, and logs do not expose the raw display-name text

#### Scenario: Safe agent-shell display name remains accepted
- **WHEN** CLI or direct runtime options use a concise non-secret display name
- **THEN** agent-shell validation accepts the display name when all other consent, visibility, authorization, and role invariants are valid
