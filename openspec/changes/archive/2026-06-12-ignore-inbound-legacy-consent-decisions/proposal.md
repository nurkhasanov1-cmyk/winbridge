## Why

Legacy `host-consent-decision` is grant-bearing host consent data, but the current agent shell authorization model uses `session-authorization-decision` plus active visible `session-authorization-state` before any viewer signal can be sent. A viewer should fail closed when it receives a legacy decision, instead of surfacing it as trusted received workflow input.

## What Changes

- Ignore inbound legacy `host-consent-decision` messages before local `received` event emission and workflow summary logging.
- Add integration coverage proving an approved legacy decision addressed to the viewer does not bind host authority, does not authorize viewer `signal` sends, and does not leak private decision details in ignore diagnostics.
- Preserve legacy `host-consent-required` request behavior as non-granting request semantics.
- Update agent-shell consent workflow specs and security/architecture docs.
- Non-goals: no screen capture, input injection, clipboard sync, file transfer, installer, service, startup persistence, credential access, Windows prompt bypass, or native Windows API work.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-shell-consent-workflow`: viewer authorization binding explicitly ignores inbound legacy host consent decisions.

## Impact

- Affected areas: `apps/agent-shell` runtime inbound filtering, integration tests, OpenSpec specs, and security/architecture documentation.
- Security impact: touches authorization/consent workflow handling and log/event redaction.
- API impact: no public API shape change; inbound legacy decision handling becomes fail-closed.
- Dependencies: none.
