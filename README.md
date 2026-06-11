# WinBridge

WinBridge is a consent-first Windows-to-Windows remote assistance project.

The current repository state is a bootstrap foundation: OpenSpec workflow, security boundaries, protocol schemas, a development relay, and a non-native agent shell. It does **not** implement screen capture, input injection, unattended access, or production deployment yet.

## Safety Scope

WinBridge is designed for authorized support sessions only.

Allowed direction:

- Explicit host approval before access.
- Visible active-session indicator on the host.
- Immediate host disconnect and permission revocation.
- Authenticated, authorized, audited sensitive actions.
- Deny-by-default session authorization for future sensitive actions.

Out of scope and prohibited:

- Hidden sessions.
- Stealth installation.
- Unauthorized persistence.
- Credential theft or keylogging.
- AV/EDR evasion.
- Bypassing Windows consent or security prompts.
- Hidden screen capture or hidden remote input.

## Repository Layout

```text
apps/
  agent-shell/     Non-native host/viewer protocol exerciser.
  relay/           WebSocket development relay.
packages/
  audit-log/       Shared development audit sinks.
  protocol/        Shared consent, session, and message schemas.
docs/              Architecture, security, GitHub setup, roadmap, orchestration.
openspec/          Spec-driven planning source of truth.
```

## Quick Start

```powershell
npm install
npm run check
npm test
npm run build
npm run openspec:validate
```

Run the development relay:

```powershell
npm run dev:relay
```

Persist development relay audit records as JSONL:

```powershell
$env:WINBRIDGE_RELAY_AUDIT_LOG_PATH = "logs\\relay-audit.jsonl"
npm run dev:relay
```

In separate terminals, exercise the protocol:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456
npm run dev:agent -- viewer --session demo --pairing 123-456
```

Exercise the development consent workflow:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view
```

This still does not capture the screen or send input. It only sends session authorization protocol messages.

## OpenSpec

Use OpenSpec for behavior changes:

```powershell
npx --yes @fission-ai/openspec@latest list
npx --yes @fission-ai/openspec@latest validate --all --strict --no-interactive
```

Important specs live in `openspec/specs/` after completed changes are archived.

## GitHub

This repo includes GitHub Actions and templates. See `docs/github-setup.md` for remote setup commands and project bootstrap steps.
