## ADDED Requirements

### Requirement: Canonical relay shared-token configuration
The managed relay runtime SHALL reject malformed development shared-token configuration before creating a listener, opening a listening socket, or accepting peer connections. Malformed shared-token configuration MUST include non-string, blank, whitespace-only, untrimmed, control-character, or oversized values.

#### Scenario: Injected shared token is untrimmed
- **WHEN** tests or caller code create the relay runtime with injected shared-token configuration containing leading or trailing whitespace
- **THEN** relay runtime creation MUST fail before listener startup or peer acceptance

#### Scenario: Environment shared token is untrimmed
- **WHEN** the relay shared-token environment value contains leading or trailing whitespace
- **THEN** relay shared-token config parsing MUST reject the value before listener startup or peer acceptance

#### Scenario: Shared-token config rejection does not leak secrets
- **WHEN** relay shared-token configuration is rejected
- **THEN** thrown errors, startup diagnostics, audit records, and logs MUST NOT expose the raw shared token, token whitespace shape, pairing codes, credentials, protocol payloads, keystrokes, screenshots, screen contents, or full secrets
