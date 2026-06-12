## ADDED Requirements

### Requirement: Canonical relay-error encoding
The relay runtime SHALL encode relay-owned `relay-error` responses through canonical JSON serialization that is not affected by inherited `toJSON` hooks or prototype pollution.

#### Scenario: Relay-error encoding ignores inherited toJSON hooks
- **WHEN** a registered peer sends malformed protocol input while an inherited `Object.prototype.toJSON` hook is present in the relay process
- **THEN** the sender receives a `relay-error` response with only the bounded reason fields
- **AND** the response body MUST NOT include fields injected by inherited `toJSON` hooks
- **AND** the remaining peer receives no forwarded protocol message

#### Scenario: Relay-error rejection audit remains secret-safe
- **WHEN** the relay emits a `relay-error` response for malformed registered peer input
- **THEN** the relay audit record remains bounded and secret-safe without raw malformed payload contents or fields injected by inherited `toJSON` hooks
