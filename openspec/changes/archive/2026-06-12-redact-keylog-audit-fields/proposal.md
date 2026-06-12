## Why

WinBridge explicitly prohibits keylogging, and audit records must not store keystroke or input contents. The current audit redaction vocabulary covers `keystroke` keys but does not cover common `keylog` or `keylogger` field names, leaving an avoidable audit leakage gap if unsafe diagnostic details are ever passed to the shared audit layer.

## What Changes

- Redact audit detail fields whose names contain `keylog` or `keylogger`, recursively and before memory, console, file, or protocol audit-event output.
- Add focused tests for shared protocol audit redaction and file audit persistence.
- Sync audit specs to treat keylog/keylogger detail keys as sensitive input/keylogging content.
- Non-goals: no keylogging feature, no native capture/input behavior, no relay routing change, no token/auth flow change, no installer/startup/service/privilege behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `audit-foundation`: expand audit redaction vocabulary for prohibited keylogging-related detail keys.
- `audit-log-persistence`: ensure persisted audit files apply the expanded keylogging redaction vocabulary.

## Impact

- Affected code: `packages/protocol/src/audit.ts`, audit-focused tests, and file audit sink tests.
- Affected specs: `openspec/specs/audit-foundation/spec.md` and `openspec/specs/audit-log-persistence/spec.md`.
- Security impact: touches logging/audit redaction; requires focused security review before release.
- No production protocol shape, dependency, relay, agent workflow, native Windows, capture, input, installer, startup, service, token, or privilege change.
