## Why

The relay currently starts at module import time, which makes real WebSocket integration testing awkward and encourages testing only isolated helpers. A managed relay runtime is needed so join, forwarding, rejection, and rate-limit behavior can be verified end to end.

## What Changes

- Add a testable relay runtime factory with explicit `start()` and `stop()` lifecycle.
- Keep the CLI entrypoint as a thin wrapper around the runtime.
- Allow tests to inject audit sinks, rate limiters, rooms, and port `0` for ephemeral local ports.
- Add WebSocket integration tests for host/viewer join, message forwarding, pairing mismatch rejection, invalid token rejection, and invalid-message rate-limit closure.
- Keep this limited to relay/runtime verification; no capture, input, clipboard, file transfer, installer, services, startup, or privilege behavior is added.

Safety impact:

- This change touches relay/networking and audit paths.
- It strengthens verification of existing consent-supporting session-broker behavior without adding remote-control capabilities.

## Capabilities

### New Capabilities
- `relay-runtime`: Managed development relay lifecycle and integration-test harness for broker behavior.

### Modified Capabilities

None.

## Impact

- Adds relay runtime module and integration tests.
- Updates relay CLI entrypoint.
- Updates architecture docs.
- Adds archived OpenSpec change artifacts and an active `relay-runtime` spec after archive.
