## Why

WinBridge already rejects or redacts many common secret-bearing field names before signals are forwarded or audit records are stored. Cloud and infrastructure credentials are often labeled as `accessKey` or `sshKey`, so treating those aliases as sensitive closes a small but practical leakage gap before richer Windows workflows are introduced.

## What Changes

- Treat signal payload keys that normalize to access-key or SSH-key variants as sensitive remote-assistance data and reject those `signal` messages before forwarding.
- Redact audit detail and protocol `audit-event.detail` fields that use access-key or SSH-key variants.
- Preserve non-secret lifecycle identifiers such as `authorizationId`.
- Add focused protocol tests for parsing and encoding paths.
- Non-goals: no new capture, input, clipboard, file-transfer, diagnostics, persistence, startup, service, privilege-elevation, bypass, or hidden-session capability.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `audit-foundation`: expand common authentication secret redaction to access-key and SSH-key field names.
- `session-broker`: expand signal payload safety to reject access-key and SSH-key field names.

## Impact

- Affected code: `packages/protocol/src/audit.ts`, `packages/protocol/src/messages.ts`.
- Affected tests: `packages/protocol/src/audit.test.ts`, `packages/protocol/src/messages.test.ts`.
- Affected systems: shared protocol validation, audit detail redaction, protocol `audit-event` redaction, relay/agent signal validation through shared schemas.
- Dependencies: none.
- Security review: required because this touches auth/secret handling and logging behavior.
