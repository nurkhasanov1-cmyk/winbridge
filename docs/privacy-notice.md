# Privacy Notice

This notice describes the current WinBridge bootstrap repository. It is not a production privacy policy for a hosted remote assistance service.

## Current Product State

WinBridge currently provides protocol schemas, a development relay, a non-native agent shell, OpenSpec requirements, tests, and documentation. It does not implement:

- Screen capture.
- Remote pointer or keyboard input.
- Clipboard synchronization.
- File transfer.
- Diagnostics collection.
- Unattended access.
- Native Windows host or viewer UI.
- Installer, startup persistence, background service, or privilege elevation behavior.
- Production accounts, telemetry, hosted storage, or production deployment.

## Data Processed During Local Development

When developers run the local relay or agent shell, the project processes development metadata needed to exercise consent and authorization workflows:

- Session ids, peer ids, device ids, roles, and bounded display-name metadata.
- Pairing tickets and pairing-code checks for local development rooms.
- Requested and granted permission names.
- Authorization ids, authorization status, visible-session state, lifecycle state, and bounded reason metadata.
- Relay connection lifecycle metadata such as joins, disconnects, heartbeat timeouts, forwarding decisions, and rejection reasons.
- Optional local JSONL audit records when a developer configures an audit log path.

This metadata is for local development and verification. It is not a production account identity system and does not grant access by itself.

## Data Not Collected By The Current Bootstrap

The current bootstrap must not collect or persist remote assistance content:

- No screenshots, screen frames, screen contents, or hidden screen capture.
- No keystrokes, keylogging output, pointer input, or hidden remote input.
- No clipboard contents.
- No file contents or file-transfer bytes.
- No diagnostics dumps.
- No credentials, API keys, cookies, private keys, authorization headers, or raw tokens.
- No production telemetry or crash uploads.

Signal probe payloads used by development tests are static protocol markers only and must not include SDP, ICE candidates, screen contents, input, clipboard data, file-transfer data, diagnostics data, tokens, pairing codes, credentials, private reasons, or display names.

## Local Logs And Audit Files

By default, development diagnostics are written to the local console as bounded metadata. Developers can opt in to local JSONL audit files:

- Relay audit path: `WINBRIDGE_RELAY_AUDIT_LOG_PATH`.
- Agent audit path: `WINBRIDGE_AGENT_AUDIT_LOG_PATH` or `--audit-log`.

Audit paths are validated before use. Audit records are redacted before output or persistence and must not contain raw secrets or remote assistance content. Local audit files remain on the developer's machine and are not uploaded by the project.

## Consent And Control

The project is designed for authorized remote assistance only:

- Host approval is explicit.
- Active sessions must be visible to the host before sensitive actions.
- Host pause, revoke, terminate, and disconnect controls are first-class safety requirements.
- Sensitive actions require authorization and audit coverage before native capture or input features can be added.

Hidden sessions, stealth installation, unauthorized persistence, credential theft, keylogging, AV/EDR evasion, Windows prompt bypass, hidden capture, and hidden input are prohibited.

## Before Production Use

Before any production release or hosted service, this notice must be replaced or extended with a production privacy policy covering account data, hosting, retention, subprocessors, telemetry, crash reporting, support access, user rights, and deletion workflows.
