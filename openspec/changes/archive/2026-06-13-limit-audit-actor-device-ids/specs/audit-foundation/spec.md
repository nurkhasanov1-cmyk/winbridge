## ADDED Requirements

### Requirement: Audit actor device attribution
The audit layer SHALL accept `deviceId` only for device-bound participant actors and MUST reject `deviceId` on infrastructure actors before storing, emitting, forwarding, or persisting audit records.

#### Scenario: Host actor carries device identity
- **WHEN** an audit record includes a `host` actor with a schema-valid `deviceId`
- **THEN** audit validation accepts the actor metadata

#### Scenario: Viewer actor carries device identity
- **WHEN** an audit record includes a `viewer` actor with a schema-valid `deviceId`
- **THEN** audit validation accepts the actor metadata

#### Scenario: Relay actor cannot carry device identity
- **WHEN** an audit record includes a `relay` actor with `deviceId`
- **THEN** audit validation rejects the record before storage, local emission, console output, file persistence, or protocol encoding

#### Scenario: System actor cannot carry device identity
- **WHEN** an audit record includes a `system` actor with `deviceId`
- **THEN** audit validation rejects the record before storage, local emission, console output, file persistence, or protocol encoding
