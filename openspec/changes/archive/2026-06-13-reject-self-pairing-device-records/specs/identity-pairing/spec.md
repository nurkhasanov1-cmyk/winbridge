## ADDED Requirements

### Requirement: Paired device records use distinct devices

The identity layer SHALL reject paired-device records whose viewer device id is identical to the host device id from the source pairing ticket before returning or using the record as trusted pairing metadata. This rejection MUST NOT consume pairing material, grant permissions, approve authorization, activate host visibility, start capture, send input, reconnect peers, suppress host visibility, sync clipboard, transfer files, expose diagnostics, install services, configure startup persistence, collect credentials, or bypass consent workflows. Rejection diagnostics MUST remain bounded and MUST NOT expose raw device ids, pairing codes, salted hash material, tokens, credentials, protocol payloads, private reasons, keystrokes, screenshots, screen contents, clipboard contents, file-transfer contents, diagnostics dumps, or full secrets.

#### Scenario: Self-pairing record is rejected

- **WHEN** code attempts to create a paired-device record whose viewer device id matches the host device id on the source ticket
- **THEN** the identity layer rejects the record before returning trusted pairing metadata
- **AND** the rejection MUST NOT grant remote access or expose raw pairing material

#### Scenario: Distinct host and viewer devices remain valid

- **WHEN** code creates a paired-device record with distinct host and viewer device ids within the source ticket validity window
- **THEN** the identity layer accepts the record when all other pairing metadata is valid
- **AND** the accepted record MUST NOT grant screen, input, clipboard, file, diagnostic, reconnect, hidden-session, or consent-bypass permissions by itself
