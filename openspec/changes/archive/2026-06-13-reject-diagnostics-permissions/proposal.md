## Why

Diagnostics can expose logs, environment metadata, device state, or other
sensitive operational data. Until WinBridge has a dedicated diagnostics
permission model with explicit host consent, visibility, revocation, and audit
requirements, diagnostics permissions must remain unavailable and fail closed.

## What Changes

- Add explicit OpenSpec coverage that diagnostics permissions are not part of
  the current authorization permission vocabulary.
- Add protocol/state-machine tests proving `diagnostics:view` is rejected in
  requested, granted, state, control, and grant scopes.
- Document that diagnostics access requires a future OpenSpec change and
  security review before implementation.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-authorization`: clarify that diagnostics permission strings are
  rejected until a dedicated consent-bound capability exists.
- `session-authorization-protocol`: clarify that authorization protocol
  messages fail closed when diagnostics permissions appear in scoped permission
  fields.

## Impact

- Affected code: `packages/protocol/src/authorization.test.ts`,
  `packages/protocol/src/messages.test.ts`, and docs.
- Safety impact: strengthens deny-by-default behavior for diagnostics. This
  change touches authorization tests/specs but does not add capture, input,
  diagnostics access, installer behavior, startup behavior, services, tokens,
  logs, privilege elevation, or relay routing behavior.
- Non-goals: no diagnostics feature, no new permission enum value, no UI, no
  native Windows work, and no production telemetry or log-access implementation.
