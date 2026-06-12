## ADDED Requirements

### Requirement: Access-key and SSH-key signal payload rejection
The protocol schema SHALL treat signal payload keys that indicate access keys or SSH keys as sensitive remote-assistance data and reject those `signal` messages before forwarding, encoding, sending, receiving, or treating the payload as trusted signaling metadata.

#### Scenario: Access-key signal payload is rejected
- **WHEN** a `signal` payload contains field names such as `accessKey`, `access_key`, or `access-key` at any nesting level
- **THEN** the protocol schema MUST reject the message before it can be forwarded or encoded

#### Scenario: SSH-key signal payload is rejected recursively
- **WHEN** a `signal` payload contains SSH-key field names such as `sshKey` or `ssh_key` inside nested objects or arrays
- **THEN** the protocol schema MUST reject the message before treating the payload as trusted remote-assistance signaling metadata

#### Scenario: Authorization identifier remains permitted
- **WHEN** a `signal` payload contains a valid top-level `authorizationId` and no sensitive access-key or SSH-key field names
- **THEN** the protocol schema MUST continue to accept the payload if all other signal safety checks pass
