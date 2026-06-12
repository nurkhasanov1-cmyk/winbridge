## MODIFIED Requirements

### Requirement: Unsafe signal rejection verification
The relay runtime SHALL expose tests proving unsafe `signal` payloads are rejected before forwarding and that rejection audit metadata remains secret-safe.

#### Scenario: Relay rejects unsafe signal payload
- **WHEN** a registered peer sends a schema-invalid `signal` message because its payload omits a valid top-level authorization id, is empty, oversized, or contains sensitive key names including raw tokens, pairing codes, API keys, authorization headers, auth headers, cookies, private keys, access keys, SSH keys, keylogging content, clipboard contents, file-transfer contents/data/bytes, or diagnostics content/dumps
- **THEN** the relay returns a relay error to the sender and does not deliver the message to the remaining peer

#### Scenario: Unsafe signal rejection audit is secret-safe
- **WHEN** the relay records an unsafe `signal` rejection
- **THEN** the audit record identifies the rejection without raw tokens, raw pairing codes, credentials, API keys, authorization headers, auth headers, cookies, private keys, raw access keys, raw SSH keys, keylogging payload contents, clipboard contents, file-transfer contents/data/bytes, diagnostics content/dumps, raw protocol payloads, keystrokes, screenshots, screen contents, or full secrets

#### Scenario: Relay rejects access-key and SSH-key signal payload
- **WHEN** a registered peer sends a `signal` message whose payload contains access-key or SSH-key field names such as `accessKey`, `access_key`, `access-key`, `sshKey`, or `ssh_key` at any nesting level
- **THEN** the relay returns a bounded relay error to the sender, does not deliver the signal to the remaining peer, and records only secret-safe rejection metadata

#### Scenario: Relay rejects keylogging signal payload
- **WHEN** a registered peer sends a `signal` message whose payload includes keylogging-related field names such as `keylog`, `rawKeylog`, `keylogger`, or `keyloggerOutput`
- **THEN** the relay returns a bounded relay error to the sender, does not deliver the signal to the remaining peer, and records only secret-safe rejection metadata
