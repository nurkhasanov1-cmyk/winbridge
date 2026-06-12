## Why

The development relay enforces one host and one viewer per session, but the non-native agent shell can be pointed at arbitrary WebSocket endpoints for CLI and integration tests. The inbound `hello` path currently treats any non-self same-session `hello` as peer presence, which can make the runtime send its own `hello` and mark recipient availability even when the inbound peer declares the same role as the local runtime.

## What Changes

- Ignore decoded inbound `hello` messages whose `role` equals the local runtime role before local `received` events and before peer presence workflow handling.
- Keep ignored-message diagnostics generic and secret-safe.
- Preserve valid opposite-role `hello` handling for host-viewer presence.
- Update `agent-shell-consent-workflow` with an inbound same-role hello boundary.
- Non-goals: do not change relay room rules, protocol schemas, pairing, authorization grants, capture, input, clipboard, file transfer, WebRTC, native Windows UI, services, startup persistence, credential access, stealth behavior, or production authentication.

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-shell-consent-workflow`: add local inbound role binding for peer `hello` presence messages before presence and recipient workflow handling.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts` and focused runtime integration tests.
- Affected docs/specs: `agent-shell-consent-workflow`.
- Security impact: touches local presence/send-path preconditions and diagnostics; requires security review.
- External API impact: same-session inbound `hello` messages with the local role are ignored by the managed runtime.
- Dependencies: no new runtime dependencies.
