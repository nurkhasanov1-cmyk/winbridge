## Why

The agent shell already logs non-protocol inbound messages as byte-count summaries, but its local `raw` runtime event still exposes the original text to consumers. That event surface can leak malformed relay errors, parser details, pairing material, tokens, credentials, screenshots, or screen/input content if future callers persist or display events.

## What Changes

- Emit `raw` runtime events as metadata-only events with a redacted placeholder instead of the original non-protocol text.
- Include safe metadata such as byte length so tests and diagnostics can still detect malformed inbound traffic without retaining payload content.
- Update agent-shell tests and documentation to cover the event-surface secrecy invariant.
- Non-goals: no screen capture, remote input, clipboard sync, file transfer, installer, startup persistence, service behavior, privilege escalation, reconnect, stealth, or Windows security prompt behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-shell-consent-workflow`: add a requirement that local `raw` runtime events are secret-safe and do not expose raw inbound non-protocol text.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts` and focused runtime integration tests.
- Affected API: the local `AgentShellEvent` `raw` event remains present but becomes redacted and includes safe metadata.
- Affected documentation: agent shell architecture/security notes.
- Safety impact: touches logs/event diagnostics only; does not add or alter any remote assistance capability.
- Review gate: security review required because the change touches log/event handling.
