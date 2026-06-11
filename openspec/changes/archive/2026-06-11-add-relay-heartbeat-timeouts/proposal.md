## Why

The development relay currently keeps peer WebSocket connections open until the socket closes or the runtime stops. A remote assistance relay needs bounded handling for unresponsive peers so tests and future operators can distinguish normal disconnects from stale sessions and audit that failure path.

## What Changes

- Add relay heartbeat configuration for the managed relay runtime and CLI.
- Track per-peer liveness through WebSocket ping/pong without inspecting or changing protocol payloads.
- Close unresponsive relay peers after a missed heartbeat timeout and emit a secret-safe audit event.
- Document that this is development relay liveness hardening, not a production distributed session availability design.
- Safety impact: this touches relay runtime behavior and relay audit logs only. It does not add capture, input, authentication bypass, installer behavior, startup behavior, service registration, token disclosure, or privilege elevation.
- Non-goals: hidden sessions, stealth persistence, credential access, keylogging, AV/EDR evasion, Windows prompt bypass, and any host-invisible access remain prohibited and out of scope.

## Capabilities

### New Capabilities
- `relay-heartbeat`: Defines relay heartbeat configuration, stale peer closure, and audit requirements for unresponsive relay connections.

### Modified Capabilities
- `relay-runtime`: The managed relay runtime gains environment-derived heartbeat configuration and test-injectable heartbeat settings.

## Impact

- `apps/relay`: runtime WebSocket liveness tracking, heartbeat configuration, tests, and CLI behavior.
- `packages/protocol`: no protocol schema changes expected.
- `packages/audit-log`: no sink interface changes expected.
- `docs`: security/architecture notes for development relay heartbeat behavior.
