# Architecture

## Bootstrap Architecture

```mermaid
flowchart LR
  Host["Host agent shell"] --> Relay["Development relay"]
  Viewer["Viewer agent shell"] --> Relay
  Host --> Protocol["packages/protocol"]
  Viewer --> Protocol
  Relay --> Protocol
```

The bootstrap validates the session protocol and relay behavior before native Windows code exists.

## Components

### packages/protocol

Owns shared schemas for:

- Device identity.
- Pairing tickets.
- Peer roles.
- Session join messages.
- Consent decisions.
- Permission grants.
- Session authorization lifecycle.
- Relay signaling.
- Session control.
- Audit events.

The protocol package is the compatibility contract between host, viewer, relay, and future native adapters.

### packages/audit-log

Owns reusable development audit sinks:

- In-memory sink for tests.
- Console JSON-lines sink for local debugging.
- Schema validation and redaction through protocol audit contracts.

Audit output must not contain raw tokens, raw pairing codes, credentials, keystrokes, screenshots, or screen contents.

### apps/relay

Provides a development WebSocket relay:

- Accepts host/viewer peers.
- Requires session id, peer id, role, and pairing credential.
- Optionally enforces a shared development token.
- Limits a room to one host and one viewer.
- Validates protocol envelopes before forwarding.
- Emits structured development audit records for joins, denials, forwarding, and disconnects.
- Rate-limits repeated invalid token and malformed-message attempts with in-memory development defaults.

This relay is not production authorization. A future identity/auth OpenSpec change must add proper accounts, token lifecycle, device trust, and audit persistence.
Production abuse protection also needs a distributed limiter or edge protection; the current limiter is single-process development hardening.

### apps/agent-shell

Provides a CLI exerciser for protocol and relay behavior. It intentionally does not capture screens, inject input, sync clipboard, transfer files, or install a service.

## Future Windows Architecture

Future native work should be split into separate OpenSpec changes:

- Host UI and session indicator.
- Viewer UI.
- Windows screen capture adapter.
- Windows input adapter.
- WebRTC media transport.
- Identity and device pairing.
- Audit persistence.
- Installer and update model.

Native code must preserve host-visible consent and revocation controls.

## Authorization Contract

Future native adapters must call the shared protocol authorization checks before processing sensitive actions. A remote action is allowed only when:

- The session authorization state is `active`.
- The host-visible session flag is true.
- The authorization has not expired.
- The requested permission is present.
- The session has not been revoked or terminated.
