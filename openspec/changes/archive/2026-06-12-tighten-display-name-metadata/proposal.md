## Why

Display names are shown in consent and presence workflows. Values with leading or trailing whitespace can look visually ambiguous in UI and logs while still passing the current non-blank validation.

## What Changes

- Reject device identity display names that are not already trimmed.
- Reject protocol display-name metadata in `hello` and legacy consent request messages when it has leading or trailing whitespace.
- Reject agent-shell `--name` and direct runtime display-name values before any relay connection or protocol send when they are untrimmed.
- Preserve existing display-name redaction in local events, logs, and audit details.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `identity-pairing`: device identity display-name metadata must be canonical before use.
- `session-broker`: protocol display-name metadata must be canonical before relay forwarding or agent acceptance.
- `session-authorization-protocol`: legacy consent request viewer display names must be canonical before consent workflow processing.
- `agent-shell-consent-workflow`: CLI/runtime display-name options and `hello` handling must inherit canonical display-name validation without weakening consent gates.

## Impact

- Affected code: `packages/protocol/src/identity.ts`, protocol tests, relay integration tests, agent-shell argument/runtime tests, the npm test script, and OpenSpec specs.
- Affected systems: protocol metadata validation, relay validation, agent-shell option validation, and local event/log redaction tests.
- Safety impact: fail-closed metadata validation only. This does not touch screen capture, remote input, clipboard, file transfer, installer behavior, startup persistence, services, privilege elevation, Windows native APIs, or token handling.
