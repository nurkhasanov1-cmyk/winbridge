## MODIFIED Requirements

### Requirement: Audit actor device attribution
The audit layer SHALL accept `deviceId` only for device-bound participant actors, SHALL reject secret-bearing participant `deviceId` values, and MUST reject `deviceId` on infrastructure actors before storing, emitting, forwarding, or persisting audit records. Rejected participant `deviceId` values MUST NOT expose raw token, credential, password, passphrase, secret, pairing code, API key, access key, cookie, private key, SSH key, authorization, authorization header, auth header, proxy authorization, protocol payload, keystroke, screenshot, screen content, clipboard content, file-transfer content, diagnostics dump, or full secret metadata in validation diagnostics.

#### Scenario: Host actor carries device identity
- **WHEN** an audit record includes a `host` actor with a schema-valid non-secret `deviceId`
- **THEN** audit validation accepts the actor metadata

#### Scenario: Viewer actor carries device identity
- **WHEN** an audit record includes a `viewer` actor with a schema-valid non-secret `deviceId`
- **THEN** audit validation accepts the actor metadata

#### Scenario: Participant actor device id contains secret-bearing metadata
- **WHEN** an audit record includes a `host` or `viewer` actor with a `deviceId` containing secret-bearing protocol identifier metadata
- **THEN** audit validation rejects the record before storage, local emission, console output, file persistence, protocol encoding, forwarding, or development component storage
- **AND** the rejection MUST NOT expose the raw `deviceId`
- **AND** the rejection MUST NOT grant permissions, approve authorization, activate host visibility, start capture, send input, reconnect peers, suppress host visibility, sync clipboard, transfer files, expose diagnostics, install services, configure startup persistence, collect credentials, hide the session from the host, or bypass consent workflows

#### Scenario: Relay actor cannot carry device identity
- **WHEN** an audit record includes a `relay` actor with `deviceId`
- **THEN** audit validation rejects the record before storage, local emission, console output, file persistence, or protocol encoding

#### Scenario: System actor cannot carry device identity
- **WHEN** an audit record includes a `system` actor with `deviceId`
- **THEN** audit validation rejects the record before storage, local emission, console output, file persistence, or protocol encoding
