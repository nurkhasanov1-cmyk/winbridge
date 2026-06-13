## Why

Diagnostics access is sensitive because logs, dumps, and local state can contain credentials, pairing data, screen context, and private workflow details. Shared authorization and protocol schemas already reject diagnostics-shaped permissions, but the agent-shell CLI, direct runtime options, and host control prompt need explicit requirements and regression coverage so diagnostics cannot appear as a development permission scope before a dedicated capability review.

## What Changes

- Add an agent-shell requirement that rejects `diagnostics:view` in requested permissions, host grant scopes, revoke permission options, direct runtime options, and interactive host control revoke commands before relay startup or managed control invocation.
- Add a safety-boundary requirement that diagnostics access remains outside the current authorization vocabulary until a future OpenSpec change and security review define consent, visibility, revocation, audit, redaction, abuse-case, and data-handling requirements.
- Add focused regression tests and documentation for the fail-closed diagnostics agent-shell paths.
- No diagnostics collection, upload, viewing, file access, logging expansion, capture, input, auth, relay, installer, startup, service, token, privilege, or native Windows capability is added.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-shell-consent-workflow`: require diagnostics-shaped permission rejection in agent-shell CLI, direct runtime options, and interactive host control commands.
- `safety-boundaries`: require diagnostics access to remain out of scope until a dedicated reviewed capability exists.

## Impact

- Affected code: `apps/agent-shell/src/args.test.ts`, `apps/agent-shell/src/runtime.integration.test.ts`, `apps/agent-shell/src/host-control-prompt.test.ts`.
- Affected docs: `README.md`, `docs/architecture.md`, `docs/security-model.md`.
- Affected specs: `openspec/specs/agent-shell-consent-workflow/spec.md`, `openspec/specs/safety-boundaries/spec.md`.
- Dependencies and wire protocol remain unchanged.
