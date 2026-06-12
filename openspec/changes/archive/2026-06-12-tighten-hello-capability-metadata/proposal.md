## Why

`hello` capability hints are presence metadata for future clients, so they must not carry ambiguous values. Today blank values and exact duplicates are rejected, but leading or trailing whitespace can make the same visible capability appear distinct.

## What Changes

- Reject `hello.capabilities` entries that are not already trimmed.
- Reject capability duplicates after trimming so whitespace cannot bypass uniqueness.
- Keep capability hints as metadata only; this does not grant access, start capture, send input, or alter consent workflow authority.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-broker`: tighten `hello` capability metadata validation before relay forwarding or agent acceptance.
- `agent-shell-consent-workflow`: ensure agent shell generated, inbound, and public-send `hello` handling inherits the stricter capability metadata contract without weakening consent gates.

## Impact

- Affected code: `packages/protocol/src/messages.ts`, protocol tests, relay integration tests, and agent-shell integration tests.
- Affected systems: protocol validation, relay forwarding validation, and agent-shell inbound/public-send validation.
- Safety impact: fail-closed metadata validation only. This does not touch capture, input, installer behavior, startup persistence, services, tokens, privilege elevation, or Windows native APIs.
