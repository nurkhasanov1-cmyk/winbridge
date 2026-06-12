## ADDED Requirements

### Requirement: Canonical signal payload size measurement
The relay and agents SHALL enforce the `signal.payload` size bound using the shared canonical JSON byte length, and inherited `toJSON` hooks or prototype pollution MUST NOT reduce or alter the measured payload size.

#### Scenario: Oversized signal payload measurement ignores inherited toJSON hooks
- **WHEN** a peer submits a `signal` payload whose canonical JSON byte length exceeds the protocol payload size bound while an inherited `toJSON` hook is present
- **THEN** the protocol schema rejects the signal as oversized before forwarding, encoding, sending, receiving, or treating it as trusted remote-assistance signaling metadata

#### Scenario: Small signal payload measurement remains stable
- **WHEN** a peer submits a schema-valid small `signal` payload whose canonical JSON byte length is within the protocol payload size bound
- **THEN** the protocol schema accepts the payload if all other signal safety checks pass
