## Why

The newer `session-authorization-*` wire messages now reject malformed permission scopes, but legacy `host-consent-*` messages still accept empty requests, duplicate permissions, and denied decisions that carry grants. Hardening these older messages removes a permissive authorization path while keeping the bootstrap protocol deny-by-default.

## What Changes

- Reject `host-consent-required` messages without requested permissions.
- Reject duplicate requested permissions in `host-consent-required`.
- Reject approved `host-consent-decision` messages without a unique non-empty grant scope.
- Reject denied `host-consent-decision` messages that carry granted permissions, and require a denial reason.
- Non-goals: no new remote actions, capture, input, clipboard, file transfer, installer, startup, service, token, privilege elevation, or native Windows behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-authorization-protocol`: add fail-closed permission-scope invariants for legacy `host-consent-*` wire messages.

## Impact

- Affected code: `packages/protocol/src/messages.ts`, `packages/protocol/src/messages.test.ts`.
- Affected specs: `openspec/specs/session-authorization-protocol/spec.md` through this delta.
- Safety impact: closes a legacy malformed consent message path before relay forwarding or peer processing.
