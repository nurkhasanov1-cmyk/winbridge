## Why

Host CLI and direct runtime configuration can carry viewer request permissions even though only viewer runtimes send `session-authorization-request`. Treating host-side request configuration as valid creates an ambiguous no-op around consent automation and makes future UI wiring harder to reason about.

## What Changes

- Reject explicit `--request` on host CLI invocations before runtime startup.
- Reject non-empty direct host runtime `requestedPermissions` before relay startup.
- Keep default empty host requested-permission state valid so existing host startup defaults remain usable.
- Keep viewer request behavior unchanged.
- Safety impact: this is fail-closed role-boundary hardening. It does not add capture, input, clipboard, file transfer, diagnostics, relay behavior, installer behavior, startup persistence, services, tokens, logs, privilege elevation, or any remote action.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: clarify and enforce that viewer authorization request configuration is viewer-only and host request configuration fails before relay/runtime startup.

## Impact

- `apps/agent-shell/src/args.ts`: host-mode CLI rejection for explicit `--request`.
- `apps/agent-shell/src/runtime.ts`: direct runtime rejection for non-empty host `requestedPermissions`.
- `apps/agent-shell/src/args.test.ts` and `apps/agent-shell/src/runtime.integration.test.ts`: focused fail-closed and unchanged viewer coverage.
- `README.md`, `docs/architecture.md`, and `docs/security-model.md`: document viewer-only request configuration.
