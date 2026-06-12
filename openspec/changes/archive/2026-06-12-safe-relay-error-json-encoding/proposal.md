## Why

The development relay still has a direct `JSON.stringify` path for non-protocol `relay-error` responses. If a same-process dependency pollutes `Object.prototype.toJSON`, that response can diverge from the bounded relay error object validated by the relay boundary.

## What Changes

- Encode relay-generated `relay-error` responses through the shared canonical JSON encoder instead of direct `JSON.stringify`.
- Add relay integration coverage proving inherited `toJSON` hooks cannot alter `relay-error` response bodies.
- Keep existing bounded relay error reasons, malformed-message audit redaction, rate limiting, and disconnect behavior unchanged.
- Non-goals: no screen capture, input injection, clipboard, file transfer, diagnostics, native Windows API, installer, startup, service, token format, privilege elevation, hidden session, reconnect, or production transport changes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `relay-runtime`: relay-owned non-protocol error responses must use canonical JSON encoding that is not affected by inherited `toJSON` hooks.

## Impact

- Affected code: `apps/relay/src/server.ts`, relay integration tests, and relay/runtime docs or specs.
- Affected APIs: the `relay-error` JSON shape remains `{ "type": "relay-error", "reason": "<bounded reason>" }`.
- Affected systems: development relay error reporting at the WebSocket boundary.
- Safety impact: strengthens relay/log/network boundary integrity without adding remote access capability. Touches relay/networking behavior and requires security review.
