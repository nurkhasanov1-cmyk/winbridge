## Why

Audit `action` metadata is currently validated for shape, but not for secret-bearing text. A malformed local component or peer `audit-event` can place token, authorization, remote-content, or diagnostic markers directly in the action string, bypassing the existing reason/detail redaction path.

## What Changes

- Reject secret-bearing audit record `action` values before local storage, console output, file persistence, protocol parsing, protocol encoding, or relay forwarding.
- Reuse the same secret marker classes already protected for audit reasons and details: raw tokens, credentials, pairing codes, authorization headers, cookies, access/SSH/private keys, keystrokes, screenshots, screen contents, clipboard/file contents, diagnostics, and full secrets.
- Keep validation failures bounded and secret-safe: thrown errors, relay errors, audit records, and peer-facing diagnostics must not echo the raw action text.
- Keep existing non-secret action names valid, including dotted lifecycle names such as `relay.peer.join.denied` and authorization lifecycle action names.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `audit-foundation`: Audit record and protocol `audit-event` action metadata rejects secret-bearing text in addition to existing shape checks.
- `relay-runtime`: Registered relay forwarding rejects secret-bearing `audit-event.action` metadata before delivery and records only bounded rejection metadata.

## Impact

- Affected code: `packages/protocol/src/audit.ts`, `packages/protocol/src/messages.ts`, protocol tests, audit-log sink tests, and relay integration tests.
- Affected systems: shared audit validation, development relay protocol validation, audit sinks.
- Safety impact: strengthens log hygiene and relay abuse resistance; does not add capture, input, installer, startup, service, privilege elevation, or persistence behavior.
- Non-goals: no hidden sessions, no credential collection, no keylogging capability, no bypass of Windows prompts, and no change to host consent or session visibility semantics.
