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
- Store a hash of the pairing code, not the raw code.
- Have limited remaining uses.
- Do not grant screen, input, clipboard, file, or diagnostic permissions by themselves.

Remote actions still require an explicit host-approved active session grant.

## Session Authorization Lifecycle

Remote assistance authorization is deny-by-default:

1. `pending`: viewer requested access; no remote action is allowed.
2. `approved`: host consented to scoped permissions; no remote action is allowed until the session is visible.
3. `active`: host consent and visible host session state are both present; only granted unexpired permissions are allowed.
4. `denied`, `revoked`, `terminated`, `expired`: all remote action checks fail closed.

Pairing is only a prerequisite relationship. It never grants screen viewing, pointer input, keyboard input, clipboard access, file transfer, or diagnostics by itself.

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

## Development Relay Abuse Protection

The development relay includes in-memory rate limiting for repeated invalid shared-token attempts and malformed or rejected protocol messages.

Rate-limit audit details are secret-safe:

- They may include booleans, remaining attempts, limits, and reset times.
- They must not include raw tokens, raw pairing codes, credentials, raw payload secrets, keystrokes, screenshots, or screen contents.

This is not production abuse protection. Production relay design must use durable or distributed controls.

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
