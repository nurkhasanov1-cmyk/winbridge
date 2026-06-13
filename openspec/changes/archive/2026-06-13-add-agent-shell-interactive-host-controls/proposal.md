## Why

The managed agent-shell runtime now has direct host controls for pause, resume, permission revocation, termination, and local disconnect, but the CLI host can only trigger most lifecycle controls through preconfigured timers. A small opt-in command prompt gives a development host operator an immediate local control surface without adding native Windows UI, screen capture, input injection, unattended access, services, or persistence.

## What Changes

- Add an opt-in CLI `--host-control-prompt true|false` mode for host runtimes.
- Accept exact host control commands from stdin:
  - `pause`
  - `resume`
  - `revoke <permission>`
  - `terminate`
  - `disconnect`
- Route accepted commands through the existing managed runtime direct controls, preserving all host-only, visible authorization, expiration, audit, indicator, and disconnect gates.
- Reject malformed, unsupported, whitespace-padded, or viewer-mode control prompt configuration before runtime startup.
- Keep prompt output and rejected-command diagnostics secret-safe by never echoing raw command lines or raw runtime exception text.

## Safety Impact

- The prompt is host-only, opt-in, and development-only. It does not grant permissions, approve requests, activate visibility, start capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide sessions, or bypass consent workflows.
- Runtime controls remain fail-closed for invisible approvals, expired grants, terminal authorizations, disconnected peers, and missing permissions.
- The prompt is mutually exclusive with the interactive host consent prompt for this increment to avoid concurrent stdin readers and accidental command/consent ambiguity.

## Non-Goals

- No native Windows host UI, tray indicator, hotkey, capture adapter, input adapter, clipboard, file transfer, service, installer, startup, or privilege-elevation behavior.
- No viewer-side control prompt.
- No production identity, account, MFA, RBAC, or durable audit storage.
- No change to relay protocol contracts.

## Impact

- Affected specs: `agent-shell-consent-workflow`
- Affected code: `apps/agent-shell/src/args.ts`, `apps/agent-shell/src/index.ts`, new focused host-control prompt helper, tests.
- Affected docs: `README.md`, `docs/architecture.md`, `docs/security-model.md`
