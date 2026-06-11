## Why

The agent shell CLI rejects malformed consent-sensitive options before the runtime starts, but tests or embedding code can construct the managed runtime directly. Direct runtime options should receive the same fail-fast treatment so malformed relay URLs, identifiers, permissions, timers, reasons, or tokens do not create relay connections or delayed workflow side effects before validation.

## What Changes

- Add managed runtime option validation before any relay WebSocket is opened.
- Validate direct runtime role, relay URL, session id, pairing code, peer id, device id, display name, token, requested permissions, revoke permission, visible-session flag, workflow timer delays, decision/lifecycle reasons, and host decision.
- Preserve safe defaults: omitted requested permissions remain empty, omitted token remains development mode, omitted host decision remains `none`, and omitted workflow options remain inactive.
- Add focused regression tests for representative malformed direct runtime options.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: add managed runtime option validation requirements for direct runtime construction.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts` and CLI parser constant sharing in `apps/agent-shell/src/args.ts`.
- Affected tests: agent-shell runtime consent workflow tests.
- Affected docs/specs: development architecture/security docs and OpenSpec agent-shell consent workflow.
- Safety impact: reduces fail-open and side-effect-before-validation risk around consent, authorization, relay connectivity, timers, and audit-triggered workflow simulations.
- Touches: authorization/consent workflow, relay URL configuration, token handling, logging-adjacent lifecycle reasons, and workflow timers. Does not add capture, input, installer, startup, services, persistence, privilege elevation, or Windows API behavior.
- Non-goals: no native screen capture, no remote input injection, no unattended access, no credential access, no stealth behavior, and no Windows security prompt bypass.
