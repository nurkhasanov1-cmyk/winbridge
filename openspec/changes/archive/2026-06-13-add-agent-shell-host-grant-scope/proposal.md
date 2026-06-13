## Why

The shared authorization model already allows host approval to grant a narrower permission subset than the viewer requested, but the development agent shell always approves the full request. Adding an explicit host grant scope exercises the permission-grant model before native UI work while keeping consent and revocation fail-closed.

## What Changes

- Add a host-only development grant-scope option for approvals.
- When configured, approved host decisions grant only the configured non-empty subset of requested permissions.
- Reject malformed, viewer-mode, deny/none-mode, empty, duplicate, or unrequested grant configuration before approval messages are sent.
- Preserve existing explicit host consent, visible active-session, revocation, signal authorization, audit, and redaction gates.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: host approval can explicitly narrow granted permissions in the development shell.

## Impact

- Affected code: `apps/agent-shell/src/args.ts`, `apps/agent-shell/src/runtime.ts`, agent-shell tests.
- Affected docs: `README.md`, `docs/architecture.md`, `docs/security-model.md`.
- Security touchpoints: authorization grant scope and audit metadata. This change does not touch capture, input execution, relay routing, installer behavior, startup persistence, services, tokens, privilege elevation, WebRTC, or native Windows APIs.
