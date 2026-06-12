## Why

CLI `--request` permission parsing currently trims each comma-separated entry before validation. That makes whitespace-padded permission input silently normalize into a grant request, which is weaker than the project's canonical-input stance for consent and authorization fields.

## What Changes

- **BREAKING**: Require each CLI `--request` permission entry to be an exact permission token with no leading or trailing whitespace.
- Keep omitted `--request` fail-closed as an empty requested permission set.
- Keep duplicate, malformed, blank, or oversized permission requests rejected before runtime startup.
- Document that comma-separated CLI permission lists are canonical and must not contain spaces around entries.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: Tighten CLI requested-permission parsing so whitespace-padded permission entries fail before relay connection or authorization workflow messages.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts` permission parsing and `apps/agent-shell/src/args.test.ts`.
- Affected docs/specs: `README.md`, `docs/security-model.md`, and `openspec/specs/agent-shell-consent-workflow/spec.md`.
- Safety impact: strengthens consent and authorization scope handling by avoiding hidden normalization of requested permissions.
- Non-goals: no screen capture, input injection, clipboard/file transfer, diagnostics access, relay protocol change, installer/startup/service work, token handling change, logging expansion, privilege elevation, stealth behavior, or Windows prompt bypass.
