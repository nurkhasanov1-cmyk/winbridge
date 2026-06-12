## Why

Audit action, reason, and target-type fields are security-relevant metadata used to interpret consent, relay, and workflow events. Values with leading or trailing whitespace can look equivalent to operators while remaining distinct to code and tests.

## What Changes

- Reject audit record `action`, optional top-level `reason`, and `target.type` metadata that is not already trimmed.
- Reject protocol `audit-event.action` metadata that is not already trimmed before parsing, encoding, forwarding, or persistence.
- Preserve existing audit detail redaction and top-level sensitive reason redaction.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `audit-foundation`: audit semantic metadata must be non-blank, bounded, and already trimmed before records or protocol audit events are stored, emitted, encoded, forwarded, or persisted.

## Impact

- Affected code: `packages/protocol/src/audit.ts`, `packages/protocol/src/messages.ts`, focused audit/protocol tests, docs, and OpenSpec specs.
- Affected systems: shared audit record validation, protocol `audit-event` validation, development audit sinks that rely on shared schemas.
- Safety impact: fail-closed audit metadata validation only. This touches audit/log metadata, but does not add or change screen capture, remote input, clipboard, file transfer, installer behavior, startup persistence, services, privilege elevation, Windows native APIs, token storage, or relay authentication.
