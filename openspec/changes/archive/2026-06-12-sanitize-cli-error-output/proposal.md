## Why

The relay and agent-shell CLI entrypoints currently print raw unexpected `Error` objects for startup and shutdown failures. Raw exception output can include stack traces, local paths, env-derived values, tokens, pairing material, or private protocol fragments, while operators only need a bounded failure signal for development diagnostics.

## What Changes

- Add secret-safe CLI error formatting for unexpected relay and agent-shell startup/shutdown failures.
- Preserve usage output for expected agent-shell argument errors while preventing unexpected errors from printing raw messages or stacks.
- Add focused tests for CLI error formatting that prove raw token/path text is not emitted.
- Document that CLI failure output is metadata-only for unexpected errors.
- Non-goals: no changes to relay routing, protocol schemas, authorization decisions, session visibility, capture, input, clipboard, file transfer, installer, startup persistence, services, privilege elevation, or Windows prompt behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `relay-runtime`: relay CLI unexpected startup/shutdown errors are reported as metadata-only diagnostics.
- `agent-shell-consent-workflow`: agent-shell CLI unexpected startup/shutdown errors are reported as metadata-only diagnostics while usage errors remain bounded help text.

## Impact

- Affected code: `apps/relay/src/index.ts`, `apps/agent-shell/src/index.ts`, and focused diagnostic tests.
- Affected docs: architecture/security notes for CLI diagnostics.
- Affected API: no protocol or runtime API changes; CLI stderr text for unexpected errors becomes generic and metadata-only.
- Safety impact: touches logs/diagnostics only; does not add or expand any remote assistance capability.
- Review gate: security review required because the change touches token/log/error handling.
