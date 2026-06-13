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
docs/              Architecture, security, privacy, release, GitHub setup, roadmap, orchestration.
openspec/          Spec-driven planning source of truth.
```

Release and privacy gates:

- [Release readiness checklist](docs/release-checklist.md)
- [Bootstrap privacy notice](docs/privacy-notice.md)

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

Omit `WINBRIDGE_RELAY_SHARED_TOKEN` for local development mode. Do not set it to an empty, whitespace-only, untrimmed, control-character, bidi/zero-width-control, or oversized value.
When a relay shared token is configured, pass the same bounded value to the agent shell with `--token`; do not embed relay tokens or credentials in `--relay` URLs.
Development shared-token values must be already trimmed, 1024 UTF-8 bytes or less, and must not contain ASCII control characters or Unicode bidi/zero-width formatting controls.
Direct development relay clients must present exactly one matching canonical lowercase `token` query parameter when a shared token is configured; missing, duplicate, case-variant, or wrong token parameters are rejected before session join.
When shared-token configuration is omitted, direct clients must also omit canonical and case-variant `token` query parameters; token-bearing connections are rejected before session join instead of being silently treated as authorized.

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

Omit `WINBRIDGE_RELAY_AUDIT_LOG_PATH` to keep console audit output. Do not set it to an empty, whitespace-only, untrimmed, control-character, bidi/zero-width-control, or oversized value.
Relay audit attribution remains secret-safe: raw attempted protocol identifiers are omitted or redacted when they contain pairing codes or obvious token, credential, cookie, or key secret-marker families, including marker words separated by `.`, `_`, `-`, or `:`.

Development relay heartbeat is enabled by default. For local tuning:

```powershell
$env:WINBRIDGE_RELAY_HEARTBEAT_INTERVAL_MS = "30000"
$env:WINBRIDGE_RELAY_HEARTBEAT_TIMEOUT_MS = "10000"
npm run dev:relay
```

Set `WINBRIDGE_RELAY_HEARTBEAT_ENABLED=false` only for focused development tests that should not start heartbeat timers. The enabled flag must be exactly one of `true`, `false`, `yes`, `no`, `1`, or `0` with no leading or trailing whitespace.
Heartbeat interval and timeout values must be exact integer milliseconds from `1` through `2147483647`.

Development invalid-token and invalid-message rate limits use canonical exact integer env values with no leading zeros. Limits must be from `1` through `1000000`; windows must be exact milliseconds from `1000` through `2147483647`:

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

Optional `--name` display values must be non-blank, already trimmed, at most 120 characters, contain no ASCII control characters, and contain no Unicode bidi or zero-width formatting controls.
Optional `--request` values must use exact comma-separated permission tokens with no spaces around entries, for example `screen:view,input:pointer`.
Optional host `--grant` values use the same exact permission-token format and can only narrow an approved host grant to a non-empty subset of the current viewer request.
Optional workflow reason values such as `--revoke-reason`, `--pause-reason`, `--resume-reason`, `--terminate-reason`, and `--disconnect-reason` must be non-blank, already trimmed, at most 240 characters, contain no ASCII control characters, and contain no Unicode bidi or zero-width formatting controls. `--disconnect-reason` is host-only and is additionally capped to 123 UTF-8 bytes so it fits WebSocket close reason metadata.

Exercise the development consent workflow:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view
```

To exercise a narrower development grant than the viewer requested:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true --grant screen:view
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view,input:pointer
```

`--grant` is host-only and requires either `--host-decision approve` or `--host-consent-prompt true`. If omitted, approval grants the full request as before. If the configured grant contains an invalid, duplicate, empty, viewer-mode, deny/none-mode, or unrequested permission, the shell fails closed before approval, active state, control, signal, or workflow audit messages.

For a closer development consent loop, let the host terminal prompt for each request:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-consent-prompt true --visible-session true
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view
```

The prompt shows the host the observed viewer peer id, validated viewer display name when available, requested permission names, and permission count before accepting input. It accepts only exact `approve` or `deny` responses before the host consent timeout expires. Prompt mode defaults to a 60000 ms timeout; use `--host-consent-timeout-ms 30000` with `--host-consent-prompt true` to configure a shorter or longer bounded wait. Static `--host-decision approve|deny` remains for deterministic automation and is mutually exclusive with `--host-consent-prompt true`. The displayed viewer identity is development peer metadata, not production account authentication.

This still does not capture the screen or send input. It only sends session authorization protocol messages and exposes local secret-safe host indicator events plus bounded viewer status snapshots for development UI wiring. Signaling payloads must be JSON-compatible objects; JavaScript-only values that JSON would drop or coerce are rejected before forwarding.

Exercise the consent-bound development signal path with a static viewer probe:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view --viewer-signal-probe-after-ms 1000
```

The viewer signal probe is viewer-only and requires an explicit `screen:view` request. It sends one static `signal` payload only after the viewer observes active visible `screen:view` authorization, and it uses the same runtime signal gates as tests. Pause, revoke, termination, expiration, local disconnect, remote disconnect, invisible approval, or missing `screen:view` prevents the probe before a local sent event or socket write. The probe does not include SDP, ICE candidates, user-provided JSON, screen contents, input, clipboard data, file-transfer data, diagnostics data, tokens, pairing codes, or display names.

For a static development round-trip check, opt the host into acknowledging trusted viewer probes:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true --host-signal-probe-ack true
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view --viewer-signal-probe-after-ms 1000
```

The host acknowledgement is host-only and defaults to off. It sends at most one static acknowledgement `signal` per authorization id, only after the inbound viewer probe has already passed runtime signal authorization gates. The acknowledgement uses the same public runtime send path as manual signals, so pause, revoke, termination, expiration, local disconnect, remote disconnect, missing recipient, routing mismatch, invisible approval, or missing `screen:view` fail closed before a local sent event or socket write. The acknowledgement payload contains only the current `authorizationId` and a static marker; it does not include SDP, ICE candidates, user-provided JSON, screen contents, input, clipboard data, file-transfer data, diagnostics data, tokens, pairing codes, credentials, private reasons, or display names.

Use the development host control prompt to invoke immediate local controls from the host terminal:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true --host-control-prompt true
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view,input:pointer
```

Host control prompt mode accepts exact commands: `help`, `status`, `pause`, `resume`, `revoke screen:view`, `terminate`, and `disconnect`. It is host-only and mutually exclusive with `--host-consent-prompt true` so only one stdin prompt is active. `help` prints a static command list and does not read runtime status, send protocol messages, or invoke controls. `status` prints bounded local host status metadata such as indicator state, visibility, permission count, and authorization id/status when available; it does not send protocol messages or invoke controls. Other commands call the same managed runtime controls as tests, so invisible sessions, expired grants, terminal sessions, disconnected peers, and missing permissions still fail closed before lifecycle protocol messages.

Managed viewer runtimes also expose a read-only `getViewerStatus()` snapshot for future viewer UI wiring. It reports only bounded lifecycle metadata such as `state`, `visibleToHost`, `permissionCount`, and optional authorization id/status. After a trusted host disconnect notice, the snapshot reports inactive local state with `visibleToHost=false` and `permissionCount=0` while preserving optional authorization id/status metadata. After managed local viewer leave, the snapshot reports inactive local state with `visibleToHost=false` and `permissionCount=0` and omits authorization id/status metadata from the left connection scope. It is viewer-only and does not send protocol messages, emit workflow audit events, grant permissions, start signaling, or invoke host controls.

Print that bounded viewer-side local status snapshot from the development CLI:

```powershell
npm run dev:agent -- viewer --session demo --pairing 123-456 --viewer-status-after-ms 1000
```

`--viewer-status-after-ms` is viewer-only, accepts an exact integer delay from `0` through `2147483647`, and does not require requested permissions. It reads only local viewer status and does not start signaling, send protocol messages, emit workflow audit events, grant permissions, or invoke host controls.

Use the development viewer control prompt for repeated local viewer status reads or a local viewer leave:

```powershell
npm run dev:agent -- viewer --session demo --pairing 123-456 --viewer-control-prompt true
```

Viewer control prompt mode accepts exact commands: `help`, `status`, and `disconnect`. It is viewer-only and mutually exclusive with `--viewer-status-after-ms` and `--viewer-disconnect-after-ms`. `help` prints a static command list and does not read runtime status, send protocol messages, invoke viewer leave, or invoke host controls. `status` prints the same bounded local viewer status snapshot as the one-shot status helper. `disconnect` invokes the managed viewer-only `leave()` control and closes only the local viewer runtime; it does not send forged `peer-disconnected`, lifecycle, signal, control, or workflow audit messages, and it cannot invoke host controls.

Simulate a viewer leaving the session locally:

```powershell
npm run dev:agent -- viewer --session demo --pairing 123-456 --viewer-disconnect-after-ms 5000
```

`--viewer-disconnect-after-ms` is viewer-only, accepts an exact integer delay from `0` through `2147483647`, and does not require requested permissions or active authorization. It invokes the managed viewer-only `leave()` control and closes only the local viewer runtime; host runtimes reject this control without closing the host transport. The viewer does not send forged `peer-disconnected`, lifecycle, signal, control, or workflow audit messages. The relay observes the socket close and notifies the remaining host.

Persist development host workflow audit records as JSONL:

```powershell
$env:WINBRIDGE_AGENT_AUDIT_LOG_PATH = "logs\\agent-audit.jsonl"
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true
```

The same path can be passed with `--audit-log logs\\agent-audit.jsonl`. Agent audit files record only secret-safe workflow audit metadata; they do not store raw protocol payloads, screen contents, input, or private reason text. Audit action, reason, target type, and detail key metadata must be bounded, trimmed where applicable, and free of control or bidi/zero-width formatting controls.
Omit `WINBRIDGE_AGENT_AUDIT_LOG_PATH` and `--audit-log` to skip local agent audit file persistence. Do not set either audit path to an empty, whitespace-only, untrimmed, control-character, bidi/zero-width-control, or oversized value.

Use a short development authorization TTL:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true --authorization-ttl-ms 30000
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view
```

Authorization TTL values must be exact positive integer milliseconds from `1` through `2147483647`.
Lifecycle workflow timer values such as pause, resume, revoke, terminate, and disconnect delays must be exact integer milliseconds from `0` through `2147483647`.

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

Revocation simulation sends bound protocol control, notification, state, local host indicator, and audit messages only; it does not perform remote actions. Viewer-side authorization remains fail-closed after revocation: later stale lifecycle messages for the same authorization id cannot restore the revoked `screen:view` permission, and terminal authorization ids cannot be reopened by approved decision replay for the same id. A different authorization id from the observed host starts a new consent scope; the previous revocation floor does not remove or restore permissions for that new authorization.

Simulate host session termination during development:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true --terminate-after-ms 5000
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view
```

Termination simulation only sends protocol and local host indicator messages; it does not capture the screen, send input, or install any background service.

Simulate host local disconnect during development:

```powershell
npm run dev:agent -- host --session demo --pairing 123-456 --host-decision approve --visible-session true --disconnect-after-ms 5000 --disconnect-reason "Host closed session"
npm run dev:agent -- viewer --session demo --pairing 123-456 --request screen:view
```

Disconnect simulation closes the host relay connection after visible activation and deactivates the local host indicator. The optional disconnect reason is local close metadata only; runtime events redact the text and audit records keep only bounded lifecycle details. The host does not send forged disconnect notices; the relay observes the close and sends `peer-disconnected` to the viewer.

## OpenSpec

Use OpenSpec for behavior changes:

```powershell
npx --yes @fission-ai/openspec@latest list
npx --yes @fission-ai/openspec@latest validate --all --strict --no-interactive
```

Important specs live in `openspec/specs/` after completed changes are archived.

## GitHub

This repo includes GitHub Actions and templates. CI runs verification on Windows with Node `20.19.0` and Node `24`. See `docs/github-setup.md` for remote setup commands and project bootstrap steps.
