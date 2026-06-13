## Why

Viewer-side workflow audit events are trusted local protocol events even when their `actorPeerId` does not match the already observed host. A forged or misdirected development lifecycle stream can therefore inject false audit metadata into local consumers before the viewer has established the host authority for the session.

## What Changes

- Require viewer-side inbound `audit-event` messages to come from the already observed opposite-role host before local `received` event emission.
- Keep ignored audit-event diagnostics redacted and metadata-only.
- Add focused integration tests for unobserved-host and mismatched-host audit events remaining secret-safe and non-authorizing.
- Preserve valid observed-host audit-event flows after normal hello-based host observation.
- Non-goals: no relay protocol changes, no native capture/input, no audit schema change, no installer/startup/service behavior, no credential collection, and no consent bypass.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-shell-consent-workflow`: strengthen viewer workflow authority binding for inbound host audit events.

## Impact

- Code: `apps/agent-shell/src/runtime.ts`
- Tests: `apps/agent-shell/src/runtime.integration.test.ts`
- Specs: `openspec/specs/agent-shell-consent-workflow/spec.md`
- Safety impact: prevents unobserved or spoofed host identities from injecting trusted viewer-side workflow audit events.
- Touches: agent shell auth/audit workflow, local events, and local logs. Does not touch capture, input, relay, installer, startup, services, tokens, privilege elevation, or Windows APIs.
