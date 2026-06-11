## Why

Relay heartbeat interval and timeout environment values are currently parsed with `Number.parseInt`, which can accept partial strings such as `1000ms`. Heartbeat timers drive stale peer disconnect behavior, so malformed or unsafe values should fail before the relay accepts connections.

## What Changes

- Parse `WINBRIDGE_RELAY_HEARTBEAT_INTERVAL_MS` and `WINBRIDGE_RELAY_HEARTBEAT_TIMEOUT_MS` as exact positive integer milliseconds.
- Reject empty, partial, fractional, negative, zero, or timer-unsafe heartbeat values before creating heartbeat timers or accepting peers.
- Apply the same safe timer bound to injected heartbeat settings used by tests and managed runtime callers.
- Preserve omitted heartbeat environment behavior and the existing enable/disable flag behavior.
- Non-goals: no production liveness service, no reconnect policy, no capture/input behavior, no installer/startup/service behavior, no token/auth changes, and no changes to consent or authorization semantics.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `relay-heartbeat`: heartbeat interval and timeout configuration must reject malformed or unsafe timer values before relay peer acceptance.
- `relay-runtime`: managed relay heartbeat settings must reject unsafe injected timer values.

## Impact

- Affected code: `apps/relay/src/heartbeat.ts`, relay heartbeat tests, README/security documentation, and OpenSpec specs.
- Affected systems: development relay liveness configuration and test-injected heartbeat settings.
- Safety impact: prevents misconfigured heartbeat timers from causing unintended stale-peer disconnect behavior or silent timer overflow.
- Security review: required because this touches relay networking/liveness behavior.
