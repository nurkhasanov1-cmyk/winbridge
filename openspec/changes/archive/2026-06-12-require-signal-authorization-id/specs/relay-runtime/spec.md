## MODIFIED Requirements

### Requirement: Unsafe signal rejection verification
The relay runtime SHALL expose tests proving unsafe `signal` payloads are rejected before forwarding and that rejection audit metadata remains secret-safe.

#### Scenario: Relay rejects unsafe signal payload
- **WHEN** a registered peer sends a schema-invalid `signal` message because its payload omits a valid top-level authorization id, is empty, oversized, or contains sensitive key names including raw tokens, pairing codes, API keys, authorization headers, auth headers, cookies, private keys, clipboard contents, file-transfer contents/data/bytes, or diagnostics content/dumps
- **THEN** the relay returns a relay error to the sender and does not deliver the message to the remaining peer

#### Scenario: Unsafe signal rejection audit is secret-safe
- **WHEN** the relay records an unsafe `signal` rejection
- **THEN** the audit record identifies the rejection without raw tokens, raw pairing codes, credentials, API keys, authorization headers, auth headers, cookies, private keys, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, raw protocol payloads, keystrokes, screenshots, screen contents, or full secrets
