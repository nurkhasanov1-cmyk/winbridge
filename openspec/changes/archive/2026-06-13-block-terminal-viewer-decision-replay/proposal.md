## Why

Viewer-side lifecycle guards already reject later active state/control messages after terminal authorization states, but a repeated `session-authorization-decision` for the same authorization id from the observed host can replace a terminal viewer snapshot before later state arrives. That creates a replay path where a denied, revoked, terminated, or expired authorization id can be made grant-bearing again.

## What Changes

- Reject repeated same-authorization `session-authorization-decision` messages after the viewer has observed a terminal snapshot for that authorization id and host authority.
- Keep diagnostics for ignored terminal decision replay secret-safe and metadata-only.
- Preserve legitimate new consent scopes by allowing a different authorization id from the observed host to bind normally.
- Add focused integration coverage for denied-to-approved decision replay and terminal-state-to-approved decision replay.
- Safety impact: strengthens viewer authorization fail-closed behavior for consent-first remote assistance.
- Non-goals: no screen capture, input execution, clipboard access, file transfer, relay protocol expansion, installer behavior, startup persistence, service behavior, token handling changes, privilege elevation, hidden sessions, or consent bypass.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-shell-consent-workflow`: viewer authorization decisions for a terminal same-authorization snapshot MUST NOT reopen that authorization id or authorize sensitive actions.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`.
- Affected tests: `apps/agent-shell/src/runtime.integration.test.ts`.
- Affected specs: `openspec/specs/agent-shell-consent-workflow/spec.md`.
- Touched area: authorization and revocation handling.
- Not touched: capture, input execution, relay, installer, startup, services, tokens, logs, or privilege elevation.
