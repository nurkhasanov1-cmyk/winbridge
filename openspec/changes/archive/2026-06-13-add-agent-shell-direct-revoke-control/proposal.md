## Why

The host can currently revoke permissions through configured development timers, but future host UI code needs an immediate local control for permission revocation. Direct revocation closes the remaining managed-runtime gap for the safety invariant that the host can revoke access immediately, while still avoiding native capture, input, clipboard, file transfer, service, or persistence behavior.

## What Changes

- Add a managed agent-shell `revokePermission(permission)` control for host runtimes.
- Require direct revocation to run only after visible active or paused unexpired host authorization.
- Require the revoked permission to be present in the current host workflow permission scope.
- Reuse the existing revocation protocol sequence: bound `session-control`, `permission-revoked`, follow-up `session-authorization-state`, local indicator update, and secret-safe `audit-event`.
- Keep audit persistence fail-closed for direct revocation: if the matching audit write fails, no revocation protocol messages are sent.
- Keep delayed workflow timers coherent after direct revocation by sharing host workflow state.

## Safety Impact

- Direct revocation is host-only and fail-closed before audit writes or socket writes for viewer runtimes, invisible approvals, expired grants, disconnected peers, terminal states, or permissions that are not currently granted.
- The change sends lifecycle protocol metadata only; it does not start screen capture, send input, sync clipboard, transfer files, install services, configure startup persistence, collect credentials, hide sessions, or bypass consent workflows.
- Audit details remain secret-safe and do not contain private reason text, tokens, pairing codes, display names, signal payloads, screenshots, or input contents.

## Non-Goals

- No native Windows UI, capture, input, clipboard, file transfer, service, installer, startup, or privilege-elevation behavior.
- No viewer-side revoke control.
- No production identity, account, MFA, RBAC, or durable audit storage.

## Impact

- Affected specs: `agent-shell-consent-workflow`
- Affected code: `apps/agent-shell/src/runtime.ts`, `apps/agent-shell/src/runtime.integration.test.ts`
- Affected docs: `docs/architecture.md`, `docs/security-model.md`
