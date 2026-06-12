## Why

The agent shell already ignores inbound self-origin authorization lifecycle and audit workflow messages before local `received` events. Legacy `host-consent-decision` is also host authority data and should use the same inbound self-authority boundary so an echoed or forged local-host decision cannot appear as trusted received workflow input.

## What Changes

- Extend the inbound workflow self-authority boundary to include legacy `host-consent-decision` messages whose `hostPeerId` identifies the local runtime peer.
- Add integration coverage proving those messages are ignored before local `received` events and workflow summary logs.
- Preserve legacy `host-consent-required` request handling as non-granting request behavior.
- Update specs and docs to name the legacy inbound self-authority boundary.
- Non-goals: no screen capture, input injection, clipboard sync, file transfer, installer, service, startup persistence, credential access, Windows prompt bypass, or native Windows API work.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-shell-consent-workflow`: inbound self-authority workflow filtering includes legacy host consent decisions from the local host authority.

## Impact

- Affected areas: `apps/agent-shell` runtime inbound filtering, integration tests, OpenSpec specs, and security/architecture documentation.
- Security impact: touches authorization/consent workflow handling and log/event redaction.
- API impact: no public API shape change; this hardens the trusted local event surface.
- Dependencies: none.
