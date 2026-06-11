## Context

The relay runtime already owns WebSocket connection acceptance, room membership, forwarding, rate-limit checks, and audit events. It currently relies on socket close events to remove peers, so an unresponsive connection can remain registered until the underlying TCP/WebSocket stack reports closure.

This change is scoped to the development relay. It does not introduce production distributed liveness, reconnect orchestration, session recovery, Windows capture, Windows input, installer behavior, startup persistence, services, or privilege elevation.

## Goals / Non-Goals

**Goals:**
- Add configurable WebSocket heartbeat checks to the managed relay runtime.
- Close stale peers and remove them from room membership.
- Emit a secret-safe audit event for heartbeat timeout failures.
- Keep heartbeat behavior test-injectable and easy to disable in focused tests.
- Document the development-only nature of the configuration.

**Non-Goals:**
- No remote capture, remote input, background access, or host-invisible session behavior.
- No reconnect, NAT traversal, multi-node state replication, or production abuse-protection replacement.
- No raw token, pairing code, or protocol payload logging.

## Decisions

1. Use WebSocket ping/pong at the relay transport layer.
   - Rationale: heartbeat is connection liveness, not a protocol command, so it should not alter `packages/protocol` schemas or application-level authorization state.
   - Alternative considered: add protocol-level heartbeat messages. Rejected for this increment because it would mix transport health with remote-assistance semantics and create unnecessary protocol surface.

2. Track heartbeat state per socket inside the relay runtime.
   - Rationale: each accepted connection already has peer registration, audit context, and close handling in `apps/relay/src/server.ts`.
   - Alternative considered: global room-level liveness. Rejected because timeout is a property of one socket, not the whole session.

3. Provide a small heartbeat helper module for configuration and state transitions.
   - Rationale: unit tests can verify env parsing and timeout transitions without relying on brittle timer timing.
   - Alternative considered: inline all logic in `server.ts`. Rejected because configuration parsing and liveness state are easier to validate separately.

4. Use development environment variables with safe defaults.
   - Rationale: current relay configuration already uses environment-derived development settings. Defaults should clean stale peers without requiring setup, while tests can inject `false` to disable heartbeat timers.
   - Variables:
     - `WINBRIDGE_RELAY_HEARTBEAT_ENABLED`: defaults to enabled; `0`, `false`, or `no` disables heartbeat.
     - `WINBRIDGE_RELAY_HEARTBEAT_INTERVAL_MS`: defaults to `30000`.
     - `WINBRIDGE_RELAY_HEARTBEAT_TIMEOUT_MS`: defaults to `10000`.

5. Audit heartbeat timeout as a failed relay peer event.
   - Rationale: timeout can affect session availability and should be visible in audit trails. Details must contain only safe metadata such as timeout settings and whether the peer had joined.
   - Alternative considered: no audit event and rely on disconnect audit only. Rejected because normal disconnect and heartbeat timeout are operationally different.

## Risks / Trade-offs

- Timer flakiness in integration tests -> Keep timer-dependent behavior minimal and cover core state transitions with unit tests; allow heartbeat to be disabled in existing integration harnesses.
- False positives on slow development machines -> Use conservative defaults and configurable intervals/timeouts.
- Duplicate audit events on timeout and socket close -> Emit a specific heartbeat timeout event before terminating, and let the existing close cleanup still remove the peer.
- Production readiness confusion -> Document that these are development defaults and not a substitute for distributed production liveness or abuse protection.

## Migration Plan

1. Add heartbeat helper and tests.
2. Wire the helper into relay runtime options and CLI defaults.
3. Disable heartbeat explicitly in integration tests that are not testing liveness.
4. Update docs with environment variables and safety scope.
5. Validate with typecheck, tests, build, and strict OpenSpec validation.

Rollback is removing the heartbeat option wiring and helper while preserving existing relay close cleanup.

## Open Questions

- Production heartbeat, reconnect, and multi-node stale-session cleanup should be specified in a future production relay change.
