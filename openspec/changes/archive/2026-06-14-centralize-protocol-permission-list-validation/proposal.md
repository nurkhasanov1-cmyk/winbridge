## Why

Permission list validation is duplicated across consent-bound grants, authorization records, authorization lifecycle transitions, and protocol envelopes. These paths protect the same remote-action scope boundary, so duplicate max-count and uniqueness checks create drift risk.

## What Changes

- Add one shared protocol helper/schema path for permission list validation.
- Route session grants, authorization records/transitions, and authorization-related protocol envelopes through the shared helper while preserving current accepted and rejected permission behavior.
- Keep unavailable and future capability permissions fail-closed, including clipboard, file-transfer, diagnostics, covert, administrative, persistence, credential, keylogging, stealth, and Windows prompt bypass shapes.
- Add focused regression coverage for shared duplicate, empty, max-count, unavailable, and safe permission list behavior.
- Do not add capture, input, clipboard, file transfer, diagnostics, relay routing/runtime behavior, installer behavior, startup persistence, services, token handling, log sinks, or privilege elevation.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `session-authorization`: require authorization and consent-bound grant permission lists to use shared validation semantics.
- `session-authorization-protocol`: require authorization-related protocol permission lists to use shared validation semantics.

## Impact

- Affected code: `packages/protocol/src/session.ts`, `packages/protocol/src/authorization.ts`, `packages/protocol/src/messages.ts`, protocol tests.
- Affected specs: `openspec/specs/session-authorization/spec.md`, `openspec/specs/session-authorization-protocol/spec.md`.
- API impact: existing permission schema exports remain available; no breaking changes intended.
- Safety impact: no new remote capability. The change keeps existing fail-closed permission rejection behavior aligned across state-machine, grant, and protocol parsing.
- Touched areas: auth and protocol validation. Does not touch capture, input runtime behavior, relay routing/runtime, installer, startup, services, tokens, logs, or privilege elevation.
