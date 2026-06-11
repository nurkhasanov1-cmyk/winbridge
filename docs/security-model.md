# Security Model

## Product Boundary

WinBridge is for authorized remote assistance. It is not a covert administration tool.

Every sensitive action must satisfy:

1. Authenticated viewer.
2. Authorized session.
3. Explicit host approval.
4. Active visible host session.
5. Permission grant for that action.
6. Audit event.
7. Immediate host revocation path.

## Sensitive Actions

Sensitive actions include:

- Viewing the host screen.
- Moving pointer or sending keyboard input.
- Clipboard reads or writes.
- File transfer.
- Restart/reconnect behavior.
- Installer, service, startup, or privilege changes.
- Access to logs, tokens, diagnostics, or identity data.

## Identity and Pairing Foundation

The current bootstrap models local device identity and expiring pairing tickets. This is not production account authentication.

Pairing tickets:

- Are short lived.
- Store a per-ticket salt and salted hash of the pairing code, not the raw code.
- Have limited remaining uses.
- Do not grant screen, input, clipboard, file, or diagnostic permissions by themselves.

The development relay creates pairing tickets when the host joins a room. Viewer joins must consume that host-created ticket before relay registration. Viewer-first, mismatched, expired, or consumed tickets are rejected before message forwarding.

Remote actions still require an explicit host-approved active session grant.

## Session Authorization Lifecycle

Remote assistance authorization is deny-by-default:

1. `pending`: viewer requested access; no remote action is allowed.
2. `approved`: host consented to scoped permissions; no remote action is allowed until the session is visible.
3. `active`: host consent and visible host session state are both present; only granted unexpired permissions are allowed.
4. `paused`: host temporarily paused the visible session; permissions are retained but all remote action checks fail closed until host resume.
5. `denied`, `revoked`, `terminated`, `expired`: all remote action checks fail closed.

Pairing is only a prerequisite relationship. It never grants screen viewing, pointer input, keyboard input, clipboard access, file transfer, or diagnostics by itself.

Protocol messages for session authorization lifecycle are explicit:

- `session-authorization-request`: viewer asks for scoped permissions.
- `session-authorization-decision`: host approves or denies with grants, expiration, and reason where applicable.
- `session-authorization-state`: peers receive current authorization state and host visibility.
- `session-control`: host controls pause, resume, termination, or permission-revocation workflow intent.
- `permission-revoked`: host or authorized actor revokes a specific permission.

Receiving one of these messages is not enough to perform a sensitive action. Components must still evaluate the shared authorization state and requested permission.

Permission revocation is a host-visible live-session transition. The shared authorization state machine accepts it only for visible, unexpired `active` or `paused` authorizations that currently include the permission. Revocation from pending, approved, denied, revoked, terminated, expired, invisible, or missing-permission states is rejected and must not create or restore access.

Host approval can narrow the viewer's requested permission scope, but it must not expand it. The shared authorization state machine rejects empty approval grants, duplicate grants, and grants for permissions that were not present in the pending viewer request.

## Development Shell Consent Simulation

The non-native agent shell can simulate consent messages for development:

- Viewer requests are explicit through requested permissions.
- Host approval is not automatic.
- Host approval requires `--host-decision approve`.
- Active session state is withheld unless `--visible-session true` is set.
- CLI parsing rejects unknown, duplicate, missing-value, malformed protocol identifier, malformed permission, malformed pairing, and non-`true`/`false` `--visible-session` values before starting the runtime.
- Authorization expiration simulation uses `--authorization-ttl-ms` and only runs after visible activation.
- Pause/resume simulation requires explicit visible approval plus `--pause-after-ms` and optional `--resume-after-ms`.
- Permission revocation simulation requires explicit visible approval plus `--revoke-after-ms` and `--revoke-permission`.
- Session termination simulation requires explicit visible approval plus `--terminate-after-ms`.
- Development `audit-event` messages are emitted for host decisions, visible activation, revocation, termination, expiration, pause, and resume using secret-safe metadata only.
- Host workflow audit records can be persisted locally with `--audit-log` or `WINBRIDGE_AGENT_AUDIT_LOG_PATH`.
- Received message logs use summaries and must not contain raw protocol payloads or raw non-protocol message text.

The shell never captures the screen, injects input, syncs clipboard, transfers files, installs services, or enables unattended access.

When the shell receives `peer-disconnected`, it records remote peer disconnected state for the current development session. Host-side delayed workflow simulations for that peer fail closed after this state and do not send later revoke, pause, resume, termination, expiration, authorization-state, session-control, permission-revoked, or workflow audit-event messages.

Peer disconnect state is not authorization. It must not approve a session, activate visibility, grant permissions, start capture, send input, reconnect a peer, suppress host visibility, or bypass consent workflows.

## Abuse Prevention Rules

The implementation must reject:

- Hidden screen capture.
- Hidden input.
- Keylogging.
- Credential collection.
- Unapproved startup persistence.
- Evasion of security software.
- Bypassing UAC or Windows consent prompts.
- Silent install/uninstall flows that hide the product from the host user.

## Development Relay Pairing

The relay stores salted hashed in-memory pairing tickets rather than raw pairing codes in peer state. Pairing ticket audit details may record safe metadata such as ticket presence, mismatch/expired/consumed booleans, and remaining use counts.

Pairing ticket salts are not secrets, but they prevent the same development pairing code from producing a stable hash across tickets.

Relay pairing audit details must not include raw pairing codes, shared tokens, credentials, protocol payloads, keystrokes, screenshots, screen contents, or full secrets.

This is not production identity. Production pairing needs durable storage, account binding, device trust, revocation, and reconnect semantics specified in a future OpenSpec change.

## Development Relay Abuse Protection

The development relay includes in-memory rate limiting for repeated invalid shared-token attempts and malformed or rejected protocol messages.

The relay rejects inbound WebSocket messages larger than the development message size bound at the transport boundary or before protocol decoding. Oversized message rejection is audited through the invalid-message path without storing raw bytes or payload contents.

Protocol-facing machine identifiers such as session ids, peer ids, message ids, authorization ids, pairing ids, device ids, and audit event ids are bounded and restricted to a safe printable profile before relay registration, forwarding, authorization, pairing, or audit-related protocol use.

`signal` protocol messages are restricted to non-empty, bounded JSON payloads. Payloads containing obvious token, credential, pairing-code, keystroke, screenshot, screen-data, screen-content, or secret keys are rejected before forwarding and are not treated as trusted remote-assistance data.

Malformed relay messages receive bounded secret-safe rejection reasons such as `Invalid relay message`. Parser details and raw malformed message contents are not returned to peers or stored in invalid-message audit reasons.

Rate-limit audit details are secret-safe:

- They may include booleans, remaining attempts, limits, and reset times.
- They must not include raw tokens, raw pairing codes, credentials, raw payload secrets, keystrokes, screenshots, or screen contents.

This is not production abuse protection. Production relay design must use durable or distributed controls.

## Development Relay Heartbeat

The development relay sends WebSocket heartbeat pings and terminates peers that miss the configured heartbeat timeout.

Heartbeat timeout audit details are secret-safe:

- They may include registration state, peer role, interval, and timeout values.
- They must not include raw shared tokens, raw pairing codes, credentials, raw payload secrets, keystrokes, screenshots, or screen contents.

Heartbeat checks only verify transport liveness. They must not grant permissions, approve sessions, start capture, send input, suppress host visibility, or bypass consent workflows.

This is not production liveness management. Production relay design must cover distributed presence, reconnect policy, and stale-session cleanup.

## Development Relay Disconnect Notices

The development relay sends a `peer-disconnected` protocol message to the remaining room peer when a registered host or viewer disconnects.

`peer-disconnected` is relay-originated. Peers must not be allowed to send forged disconnect notices through the relay; peer-originated copies are rejected before forwarding and audited as invalid relay messages.

Disconnect notices:

- Identify the disconnected peer id and role.
- Use bounded reason codes such as `peer-closed`.
- Do not include raw WebSocket close reasons.
- Do not grant permissions, approve sessions, start capture, send input, reconnect peers, suppress host visibility, or bypass consent workflows.

Disconnect audit details may include the peer role, bounded reason code, notification target count, notification sent count, and notification failure count. They must not include raw shared tokens, raw pairing codes, credentials, raw payload secrets, keystrokes, screenshots, screen contents, or full secrets.

## Development Audit Files

The relay can write local development audit records to JSONL when `WINBRIDGE_RELAY_AUDIT_LOG_PATH` is configured.

The agent shell can write local host workflow audit records to JSONL when `WINBRIDGE_AGENT_AUDIT_LOG_PATH` or `--audit-log` is configured.

File audit records use the same schema validation and redaction as memory and console sinks. Write failures are surfaced to the caller instead of silently dropping records.

Development audit files must not contain raw tokens, raw pairing codes, credentials, keystrokes, screenshots, screen contents, or full secrets.

Agent shell audit files must not persist arbitrary received protocol payloads, raw display names, signal payloads, raw private reason text, screen contents, or input contents.

## Review Gates

### Design Gate

Before implementation, confirm:

- Threat model.
- Consent flow.
- Visible session indicator.
- Disconnect/revoke control.
- Audit events.
- Failure behavior.

### Implementation Gate

Every PR touching remote capability code must verify:

- Denied consent blocks the action.
- Revoked permission stops the action.
- Session timeout stops the action.
- Local disconnect terminates the action.
- Audit events are emitted.
- Audit details do not include raw tokens, raw pairing codes, credentials, keystrokes, screenshots, or screen contents.

### Release Gate

Before release, documentation must describe:

- What data is transmitted.
- Who can connect.
- How the host sees and stops a session.
- How to revoke access.
- How to uninstall.
- Where audit records live.
