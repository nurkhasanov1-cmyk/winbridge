## Why

Agent-shell runtime now requires `signal.payload.authorizationId` to match the active visible authorization, but protocol schema and relay validation still accept generic non-empty signal payloads. Making the authorization id mandatory at the wire-contract layer prevents unbound signals from being forwarded as schema-valid signaling data.

## What Changes

- Require every protocol `signal` payload to include a top-level string `authorizationId` that passes the bounded protocol identifier rules.
- Keep `authorizationId` classified as non-secret lifecycle metadata while preserving existing rejection of token, credential, clipboard, file-transfer, diagnostics, screenshot, screen-content, and input/keylogging payload keys.
- Update relay integration fixtures and protocol tests so accepted signals always carry authorization metadata.
- Add rejection coverage for missing or malformed signal payload authorization ids.
- Do not add native screen capture, remote input, clipboard sync, file transfer, diagnostics capture, reconnect, installer, service, startup persistence, relay production auth, or privilege elevation.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-broker`: require signal payload authorization id as part of signal payload validation.
- `relay-runtime`: verify relay rejection for unbound signal payloads before forwarding.

## Impact

- Affected code: `packages/protocol/src/messages.ts`, `packages/protocol/src/messages.test.ts`, `apps/relay/src/server.integration.test.ts`, and signal fixtures in `apps/agent-shell/src/runtime.integration.test.ts`.
- Affected specs/docs: session broker and relay runtime specs, plus architecture/security docs if operator guidance needs to name the wire-contract requirement.
- Security impact: touches signaling validation and relay forwarding. It strengthens fail-closed behavior and does not implement capture, input, stealth, credential access, persistence, AV/EDR evasion, Windows prompt bypass, or production authorization.
