## Why

After a host successfully terminates a visible session from the interactive
control prompt, the authorization is terminal and the host indicator is
inactive, but the prompt can still accept more commands. That leaves a stale
local control surface after the host has ended the session.

## What Changes

- Stop the interactive host control prompt after a successful exact
  `terminate` command.
- Keep the prompt open when `terminate` fails so the operator can see the
  sanitized runtime error and choose another valid command such as `status`.
- Preserve the existing managed runtime termination workflow; this change only
  updates prompt-local lifecycle after success or failure.
- Add regression coverage and documentation for host prompt terminal-session
  shutdown behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: host control prompt lifecycle after a
  successful explicit host termination and after failed host termination.

## Impact

- Affected code: `apps/agent-shell/src/host-control-prompt.ts` and tests.
- Affected docs: README and safety/architecture notes for host controls.
- Safety impact: reduces stale-looking local host control state after a
  terminal session action while preserving recoverability on failure.
- Touch analysis: user-visible workflow around existing authorization
  termination; no capture, input, relay, installer, startup, service, token,
  privilege, persistence, native Windows API, or protocol shape changes.
- Non-goals: no native Windows UI, no screen capture, no remote input, no
  reconnect, no hidden session behavior, and no new termination semantics.
