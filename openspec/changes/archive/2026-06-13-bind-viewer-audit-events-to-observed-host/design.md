## Context

Viewer runtimes accept decoded protocol messages only after several pre-`received` safety gates. Authorization decisions and lifecycle state are already bound to the observed host authority, but inbound `audit-event` messages are currently only rejected when they appear self-authored by the local runtime. In a direct or malicious lifecycle stream, this lets an unobserved or mismatched host id create a trusted local `received` audit event.

## Goals / Non-Goals

**Goals:**

- Reject viewer-side `audit-event` messages before local `received` event emission unless `actorPeerId` matches the observed opposite-role host.
- Keep rejected audit-event diagnostics secret-safe: raw detail, action metadata, peer ids, tokens, pairing codes, screen/input content, and private markers must not appear in events or logs.
- Preserve the normal relay-backed workflow where host `hello` establishes the observed host before host-generated audit events are accepted.

**Non-Goals:**

- Do not change relay forwarding, protocol schemas, audit record persistence, reconnect behavior, native capture/input, clipboard, file transfer, installer, startup, services, privilege elevation, or Windows-native APIs.
- Do not treat relay room size as host identity.
- Do not add any hidden capture/input, stealth, credential collection, keylogging, AV/EDR evasion, or Windows prompt bypass capability.

## Decisions

- Reuse the observed host authority gate for inbound viewer audit events.
  - Rationale: `sessionState.observedPeerId/observedPeerRole` is already the session-local authority boundary for viewer authorization decisions and trusted disconnect notices.
  - Alternative considered: accept any audit event because protocol detail redaction limits payload exposure. Rejected because local consumers could still treat spoofed audit actions as trusted workflow metadata.

- Guard before local `received` event emission.
  - Rationale: ignored audit events can contain private action names, detail keys, peer ids, tokens, and remote-assistance content. The existing unsafe inbound path only emits redacted raw byte metadata.
  - Alternative considered: emit a redacted received audit event while ignoring it for state. Rejected because audit events are themselves workflow authority metadata.

- Keep the implementation in the agent shell.
  - Rationale: the relay already enforces registered host authority for forwarded `audit-event` messages; this change hardens direct agent-shell streams and defense in depth.

## Risks / Trade-offs

- A synthetic lifecycle stream that sends audit events before host `hello` will now fail closed. This is acceptable because the viewer has not established the concrete host authority yet.
- Focused tests need explicit observed host presence for valid audit-event streams. This makes synthetic tests closer to the real relay handshake.
