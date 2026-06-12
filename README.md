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

Or run the full local gate:

```powershell
npm run verify
```

Run the development relay:

```powershell
npm run dev:relay
```

Require a bounded local development shared token:

```powershell
$env:WINBRIDGE_RELAY_SHARED_TOKEN = "dev-shared-token"
npm run dev:relay
```

Omit `WINBRIDGE_RELAY_SHARED_TOKEN` for local development mode. Do not set it to an empty, whitespace-only, untrimmed, control-character, or oversized value.
When a relay shared token is configured, pass the same bounded value to the agent shell with `--token`; do not embed relay tokens or credentials in `--relay` URLs.
Development shared-token values must be already trimmed, 1024 UTF-8 bytes or less, and must not contain ASCII control characters.
Direct development relay clients must present exactly one matching `token` query parameter when a shared token is configured; missing, duplicate, or wrong token parameters are rejected before session join.
When shared-token configuration is omitted, direct clients must also omit `token` query parameters; token-bearing connections are rejected before session join instead of being silently treated as authorized.

Configure the local relay port with an exact integer TCP port:

```powershell
$env:WINBRIDGE_RELAY_PORT = "8787"
npm run dev:relay
```

Persist development relay audit records as JSONL:

```powershell
$env:WINBRIDGE_RELAY_AUDIT_LOG_PATH = "logs\\relay-audit.jsonl"
npm run dev:relay
```

Omit `WINBRIDGE_RELAY_AUDIT_LOG_PATH` to keep console audit output. Do not set it to an empty or whitespace-only value.

Development relay heartbeat is enabled by default. For local tuning:

```powershell
$env:WINBRIDGE_RELAY_HEARTBEAT_INTERVAL_MS = "30000"
$env:WINBRIDGE_RELAY_HEARTBEAT_TIMEOUT_MS = "10000"
npm run dev:relay
```

Set `WINBRIDGE_RELAY_HEARTBEAT_ENABLED=false` only for focused development tests that should not start heartbeat timers.
Heartbeat interval and timeout values must be exact integer milliseconds from `1` through `2147483647`.

Development invalid-token and invalid-message rate limits use exact integer env values:

```powershell
$env:WINBRIDGE_RELAY_INVALID_TOKEN_LIMIT = "5"
$env:WINBRIDGE_RELAY_INVALID_TOKEN_WINDOW_MS = "60000"
$env:WINBRIDGE_RELAY_INVALID_MESSAGE_LIMIT = "5"
$env:WINBRIDGE_RELAY_INVALID_MESSAGE_WINDOW_MS = "60000"
npm run dev:relay
```

Development relay pairing tickets are host-created, hashed, expiring, and consumed by viewer joins:

```powershell
$env:WINBRIDGE_RELAY_PAIRING_TICKET_TTL_MS = "300000"
$env:WINBRIDGE_RELAY_PAIRING_TICKET_MAX_USES = "1"
npm run dev:relay
```

The host should join before the viewer. Pairing only admits the viewer to the relay room; it does not grant screen, input, clipboard, file, or diagnostic permissions.
Pairing ticket TTL values must be exact integer milliseconds from `0` through `86400000`; maximum uses must be an exact integer from `1` through `10`.

In separate terminals, exercise the protocol:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456
npm run dev:agent -- viewer --session demo --pairing 123-456
```

Optional `--name` display values must be non-blank, already trimmed, and at most 120 characters.
Optional workflow reason values such as `--revoke-reason`, `--pause-reason`, `--resume-reason`, and `--terminate-reason` must be non-blank, already trimmed, and at most 240 characters.

Exercise the development consent workflow:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view
```

This still does not capture the screen or send input. It only sends session authorization protocol messages and local secret-safe host indicator events for development UI wiring. Signaling payloads must be JSON-compatible objects; JavaScript-only values that JSON would drop or coerce are rejected before forwarding.

Persist development host workflow audit records as JSONL:

```powershell
$env:WINBRIDGE_AGENT_AUDIT_LOG_PATH = "logs\\agent-audit.jsonl"
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true
```

The same path can be passed with `--audit-log logs\\agent-audit.jsonl`. Agent audit files record only secret-safe workflow audit metadata; they do not store raw protocol payloads, screen contents, input, or private reason text.
Omit `WINBRIDGE_AGENT_AUDIT_LOG_PATH` and `--audit-log` to skip local agent audit file persistence. Do not set either audit path to an empty or whitespace-only value.

Use a short development authorization TTL:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true --authorization-ttl-ms 30000
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view
```

Workflow timer values must be exact integer milliseconds from `0` through `2147483647`.

Expiration simulation sends protocol state, local host indicator, and audit messages only.

Simulate host pause/resume during development:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true --pause-after-ms 5000 --resume-after-ms 5000
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view
```

Pause/resume simulation only sends protocol state, control, local host indicator, and audit messages. It does not perform remote actions.

Simulate host revocation during development:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true --revoke-after-ms 5000 --revoke-permission screen:view
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view
```

Revocation simulation sends bound protocol control, notification, state, local host indicator, and audit messages only; it does not perform remote actions.

Simulate host session termination during development:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true --terminate-after-ms 5000
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view
```

Termination simulation only sends protocol and local host indicator messages; it does not capture the screen, send input, or install any background service.

Simulate host local disconnect during development:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true --disconnect-after-ms 5000
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view
```

Disconnect simulation closes the host relay connection after visible activation and deactivates the local host indicator. It does not send forged disconnect notices; the relay observes the close and sends `peer-disconnected` to the viewer.

## OpenSpec

Use OpenSpec for behavior changes:

```powershell
npx --yes @fission-ai/openspec@latest list
npx --yes @fission-ai/openspec@latest validate --all --strict --no-interactive
```

Important specs live in `openspec/specs/` after completed changes are archived.

## GitHub

This repo includes GitHub Actions and templates. See `docs/github-setup.md` for remote setup commands and project bootstrap steps.
