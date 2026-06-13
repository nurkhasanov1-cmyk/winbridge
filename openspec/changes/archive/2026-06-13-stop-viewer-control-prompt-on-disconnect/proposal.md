## Why

The interactive viewer control prompt currently stops before the managed
viewer `leave()` operation completes. If local viewer disconnect fails, the
prompt is already closed, leaving the viewer without the same local recovery
path that host controls now preserve after a failed disconnect.

## What Changes

- Stop the interactive viewer control prompt after a successful exact
  `disconnect` command.
- Keep the prompt open when local viewer `disconnect` fails so the operator can
  see the sanitized runtime error and run later valid commands such as
  `status`.
- Preserve the existing viewer-only local leave boundary; this change only
  updates prompt lifecycle behavior after success or failure.
- Add regression coverage and documentation for the viewer prompt shutdown
  behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: viewer control prompt lifecycle after a
  successful explicit local viewer disconnect and after failed local leave.

## Impact

- Affected code: `apps/agent-shell/src/viewer-control-prompt.ts` and tests.
- Affected docs: README and safety/architecture notes for viewer controls.
- Safety impact: improves local viewer operator recovery after failed local
  disconnect and removes stale-looking local control input after successful
  leave.
- Touch analysis: user-visible workflow only; no capture, input, auth, relay,
  installer, startup, service, token, log, privilege, or persistence behavior.
- Non-goals: no native Windows UI, no screen capture, no remote input, no
  reconnect, no hidden session behavior, and no protocol shape changes.
