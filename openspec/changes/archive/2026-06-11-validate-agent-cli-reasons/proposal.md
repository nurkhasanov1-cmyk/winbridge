## Why

The protocol rejects blank or oversized lifecycle reasons, but the development agent shell currently accepts raw `--revoke-reason`, `--pause-reason`, `--resume-reason`, and `--terminate-reason` strings during argument parsing. Invalid reason text can therefore fail later in delayed workflow simulation instead of failing before runtime startup.

## What Changes

- Validate optional lifecycle reason CLI values during argument parsing.
- Reject blank or oversized reason values through the existing bounded usage error before connecting to the relay.
- Preserve existing omitted-reason behavior so runtime defaults remain safe.
- Non-goals: no new remote actions, no protocol message shape changes, no capture/input/clipboard/file transfer, no installer/startup/service behavior.

## Capabilities

### New Capabilities

### Modified Capabilities
- `agent-shell-consent-workflow`: CLI argument validation rejects malformed lifecycle reason values before runtime startup.

## Impact

- Affected code: `apps/agent-shell/src/args.ts`, `apps/agent-shell/src/args.test.ts`, documentation and OpenSpec artifacts.
- Safety impact: improves fail-closed handling for authorization/session-control metadata. Does not relax host consent, visibility, revocation, audit, or permission checks.
