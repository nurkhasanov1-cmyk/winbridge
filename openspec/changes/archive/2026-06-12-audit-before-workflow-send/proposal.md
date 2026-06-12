## Why

Host workflow actions are security-sensitive because they grant, revoke, pause, resume, terminate, or expire remote-assistance authorization. When a local development audit sink is configured, those actions should fail closed before any externally visible workflow message is sent if the matching audit record cannot be written.

## What Changes

- Require host workflow audit persistence to occur before sending the associated authorization decision, authorization state, permission revoke, session control, or protocol `audit-event` message.
- Change audit sink failure behavior so the host does not emit the associated workflow messages when the local audit write fails.
- Preserve existing no-file development behavior: if no audit sink is configured, protocol `audit-event` messages are still emitted as before.
- Add tests for denied decisions and delayed lifecycle failures to ensure no unaudited external workflow messages are emitted.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: Host workflow audit persistence becomes a precondition for emitting the associated workflow messages when an audit sink is configured.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`, `apps/agent-shell/src/runtime.integration.test.ts`, OpenSpec artifacts.
- API impact: no public API shape change; internal ordering and failure semantics change for configured audit sinks.
- Safety impact: strengthens fail-closed auditability for consent and authorization lifecycle workflow messages.
- Touches logs/audit and authorization workflow behavior; requires security review.
- Non-goals: production audit storage, encryption, account authentication, screen capture, input injection, clipboard sync, file transfer, installer behavior, startup behavior, service registration, privilege elevation, hidden access, AV/EDR evasion, credential access, keylogging, or Windows prompt bypass.
