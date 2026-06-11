## Context

The development relay heartbeat sends WebSocket pings and terminates peers that miss a pong within the configured timeout. Defaults are safe, and tests can disable or inject heartbeat settings. Environment parsing currently uses `Number.parseInt`, so values with suffixes can be accepted unintentionally, and oversized values can reach JavaScript timer APIs.

This change hardens relay configuration only. Heartbeats remain a transport liveness mechanism and do not grant permissions, approve sessions, start capture, send input, suppress visibility, or change authorization state.

## Goals / Non-Goals

**Goals:**

- Reject malformed heartbeat interval/timeout environment values before relay startup accepts peers.
- Reject injected heartbeat settings that are not safe positive integer timer delays.
- Preserve omitted heartbeat defaults and existing `WINBRIDGE_RELAY_HEARTBEAT_ENABLED` parsing.
- Keep errors bounded and free of raw secrets or protocol payloads.

**Non-Goals:**

- No production liveness management or reconnect policy.
- No distributed presence, durable session cleanup, or account/device trust changes.
- No capture, input, installer, startup, service, token, log, or privilege changes.

## Decisions

1. Use exact positive integer parsing for heartbeat env values.

   Heartbeat interval and timeout environment values will use the same fail-fast style as other relay configuration: omitted values use defaults, but configured values must be exact decimal integers. Alternative considered: continue accepting `parseInt` prefixes. That is ambiguous for an operator-facing liveness configuration.

2. Bound heartbeat timer values to the safe JavaScript timer delay.

   `setInterval` and `setTimeout` use timer delays that are unsafe above the signed 32-bit millisecond bound. Both env-derived and injected heartbeat settings will reject values above `2_147_483_647`. Alternative considered: clamp oversized values. Clamping would silently change liveness behavior.

3. Keep heartbeat disabled flag behavior unchanged.

   This change does not alter the existing true/false/yes/no/1/0 enabled flag contract. Malformed enabled values already fail fast.

## Risks / Trade-offs

- Local scripts that relied on partial strings or oversized heartbeat values will now fail before relay startup. This is intended fail-fast behavior.
- Very long heartbeat intervals above the safe timer bound remain unsupported in the development relay. Production liveness semantics require a separate design.
