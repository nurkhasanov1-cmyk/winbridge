## Context

The current permission parser rejects `diagnostics:view` because it is outside the allowed permission vocabulary. Authorization and protocol specs already cover shared state-machine and wire-message rejection, while the agent shell uses the same parser for CLI and runtime permission inputs.

Diagnostics remains high risk even in development: diagnostic dumps and logs can contain tokens, pairing codes, private reasons, local file paths, screen context, clipboard content, or other sensitive support data. The safest current behavior is to keep diagnostics entirely unavailable until a future reviewed capability defines consent text, visibility, revocation, audit, redaction, and data-handling requirements.

## Goals / Non-Goals

**Goals:**

- Pin `diagnostics:view` rejection on every agent-shell permission entry point that could otherwise request, grant, revoke, or control a diagnostics permission.
- Keep the rejection before relay startup, protocol sends, host visibility activation, or managed host control invocation.
- Document that diagnostics remains outside the current capability set.

**Non-Goals:**

- No diagnostics viewing, export, upload, capture, collection, or persistence capability.
- No new protocol permission, message, audit sink, relay routing behavior, auth behavior, native Windows API, installer, startup, service, token, or privilege behavior.
- No weakening of existing `screen:view`, `input:pointer`, or `input:keyboard` workflows.

## Decisions

- Reuse existing shared permission validation rather than adding a second diagnostics-specific parser.
  - Rationale: a single parser keeps CLI, runtime, host-control, authorization, and protocol behavior consistent.
  - Alternative considered: add explicit string checks in agent-shell. Rejected because duplicate deny lists drift.
- Add regression tests instead of changing production code.
  - Rationale: current behavior already fails closed; tests make the safety contract durable.
  - Alternative considered: add a `diagnostics:view` enum value and mark it unavailable. Rejected because diagnostics has no reviewed capability contract and should remain outside the vocabulary.
- Extend safety and docs language to mention CLI, runtime, and host-control surfaces.
  - Rationale: operators should see that diagnostics cannot be simulated through agent-shell development options.

## Risks / Trade-offs

- [Risk] A future diagnostics capability might need a real permission string and reviewed UI.
  - Mitigation: require a new OpenSpec change and security review before adding the string to the permission vocabulary.
- [Risk] Tests could assert only one input path while another path drifts.
  - Mitigation: cover CLI request/grant/revoke, direct runtime request/grant/revoke, and host control prompt parsing.
