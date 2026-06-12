## Why

The shared protocol already treats access-key and SSH-key signal payload fields as sensitive remote-assistance data. Agent-shell integration coverage should explicitly prove that public runtime sends and inbound runtime processing inherit that validation without emitting trusted sent/received events or leaking raw key values.

## What Changes

- Update the agent-shell signal payload validation requirement to include sensitive access-key and SSH-key field rejection.
- Add integration coverage for public `send()` with access-key and SSH-key signal payload fields.
- Add integration coverage for inbound signal payloads carrying access-key or SSH-key fields before trusted `received` event emission.
- Non-goals: no screen capture, input, clipboard, file transfer, diagnostics collection, native Windows APIs, installer, startup, service, persistence, or privilege-elevation behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: Extend signal payload validation requirements to prove access-key and SSH-key rejection on public-send and inbound agent-shell paths.

## Impact

- Affected code: `apps/agent-shell/src/runtime.integration.test.ts` and agent-shell OpenSpec artifacts.
- Affected systems: non-native agent-shell runtime validation and diagnostics coverage only.
- Safety impact: strengthens proof that credential-like key material cannot become trusted signal metadata or appear in local runtime events/logs.
