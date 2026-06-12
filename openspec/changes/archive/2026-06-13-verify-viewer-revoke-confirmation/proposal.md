## Why

The agent-shell spec already requires a viewer to accept a same-authority `permission-revoked` confirmation after a bound revoke-permission `session-control`, while keeping remote action checks fail-closed. Existing integration coverage proves the revoke control blocks later signals, but does not directly prove that the follow-up confirmation can be received without restoring access.

## What Changes

- Add explicit agent-shell integration coverage for the viewer revoke-control confirmation path.
- Verify a viewer emits the follow-up `permission-revoked` confirmation from the same host authority and authorization id.
- Verify viewer-originated `signal` sends remain rejected after the confirmation, before socket write and local `sent` event emission.
- Verify confirmation diagnostics remain secret-safe and do not expose the raw revoke reason marker.
- No runtime behavior change is intended.
- No breaking changes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: add testable coverage for the existing revoke-control confirmation requirement.

## Impact

- Affected code: `apps/agent-shell/src/runtime.integration.test.ts`.
- Affected specs: `openspec/specs/agent-shell-consent-workflow/spec.md`.
- Safety impact: strengthens verification that a revoke confirmation cannot restore screen signal authorization. This touches agent-shell tests/specs only and does not change screen capture, remote input, clipboard, file transfer, installer behavior, startup persistence, services, privilege elevation, Windows native APIs, token semantics, authentication grants, relay behavior, or audit schemas.
