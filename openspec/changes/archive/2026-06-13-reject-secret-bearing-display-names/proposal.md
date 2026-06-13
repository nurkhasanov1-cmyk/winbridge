## Why

Display names are host-facing peer metadata used in identity records, hello messages, legacy consent prompts, and agent-shell configuration. They are already bounded and format-safe, but they should also fail closed when a user or peer attempts to place token, credential, pairing-code, authorization-header, screen-content, clipboard-content, file-transfer, diagnostics, or similar secret-bearing metadata in a display-name field.

## What Changes

- Reject secret-bearing display-name metadata before it can be used as device identity, protocol peer metadata, legacy consent prompt metadata, agent-shell CLI input, runtime options, local trusted events, socket writes, relay forwarding, logs, or audit details.
- Keep safe non-secret display names accepted.
- Preserve existing consent, visibility, revocation, authorization, and audit invariants; this change only tightens validation.

## Capabilities

### New Capabilities

### Modified Capabilities
- `identity-pairing`: device identity display names reject secret-bearing metadata before trust.
- `session-broker`: protocol display-name metadata rejects secret-bearing metadata before forwarding or trusted handling.
- `session-authorization-protocol`: legacy consent request display names reject secret-bearing metadata before consent UI processing.
- `agent-shell-consent-workflow`: CLI, direct runtime, inbound hello, and public hello display names reject secret-bearing metadata.

## Impact

- Affected code: `packages/protocol/src/identity.ts`, protocol tests, agent-shell argument/runtime validation tests, README, and security model documentation.
- No new remote access capability, no capture/input/native Windows API, installer, startup, service, privilege elevation, or persistence behavior.
- Touches peer metadata validation and secret exposure boundaries; includes focused security review and full verification.
