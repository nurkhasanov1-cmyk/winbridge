## Why

When the development relay runs without a configured shared token, a client can still present a `token` query parameter that is silently ignored. That can mislead operators into thinking token-based access is active and weakens the clarity of the development authorization boundary.

## What Changes

- Reject relay connections that present any `token` query parameter when the relay has no configured shared token.
- Audit the rejection as a secret-safe denied token event without storing or echoing the presented token.
- Keep existing behavior for configured shared tokens: exactly one matching token is still required.
- Update docs to make omitted shared-token mode explicit: it is open local development mode and must not accept token-bearing client URLs.
- Non-goals: production account authentication, native Windows capture, remote input, clipboard, file transfer, installer, startup persistence, services, or privilege elevation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-broker`: tighten development relay token behavior when no shared token is configured.
- `relay-runtime`: add testable runtime coverage for rejecting unconfigured token query parameters and keeping rejection diagnostics secret-safe.

## Impact

- Affected code: `apps/relay/src/server.ts` and relay integration tests.
- Affected docs: `README.md`, `docs/architecture.md`, and `docs/security-model.md`.
- Affected systems: development relay authentication boundary, token-denial audit records, and OpenSpec validation.
- Safety impact: improves fail-closed handling for token-bearing relay connections and avoids false authorization signals.
