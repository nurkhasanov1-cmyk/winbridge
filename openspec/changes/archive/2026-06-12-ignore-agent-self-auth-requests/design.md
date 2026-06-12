## Context

The non-native agent shell receives decoded protocol envelopes from the development relay and then emits local runtime events, writes summary logs, and runs host-side consent workflow simulation. The runtime already ignores decoded messages for other sessions before those side effects. This change adds the same fail-closed posture for a same-session authorization request that claims the local peer is the viewer/requester.

The relay remains the primary forwarding boundary for normal development traffic. The agent shell still needs a local defense-in-depth check because its managed runtime can be exercised by tests, tools, or unexpected relay-like endpoints.

## Goals / Non-Goals

**Goals:**

- Ignore inbound `session-authorization-request` messages where `viewerPeerId` equals the local runtime `peerId`.
- Run the check before local `received` protocol event emission, summary receive logging, host authorization decisions, authorization state updates, or workflow audit events.
- Keep ignored-message diagnostics secret-safe by exposing only redacted summary metadata such as byte length.
- Preserve valid two-peer authorization request behavior.

**Non-Goals:**

- No production identity, relay authorization, account, token lifecycle, capture, input, clipboard, file transfer, installer, service, startup, privilege, or native Windows behavior changes.
- No schema change to the protocol package.
- No replacement for relay-side role and recipient enforcement.

## Decisions

- Add an agent-shell inbound self-authority guard after protocol decoding and session matching, before received-event emission.
  - Rationale: the decoded envelope shape is required to inspect `viewerPeerId`, and the guard must run before workflow side effects.
  - Alternative considered: rely only on relay enforcement. Rejected because the managed runtime should fail closed when exercised against an unexpected relay-like source.
- Reuse the ignored-message redaction shape for unsafe decoded inbound protocol messages.
  - Rationale: cross-session and self-authority violations are both untrusted inbound protocol inputs and should avoid exposing payload type, identifiers, or private reasons in local raw events/logs.
  - Alternative considered: emit a more specific local event. Rejected because specificity would increase the chance of leaking protocol metadata from ignored input.
- Keep the guard narrow to `session-authorization-request`.
  - Rationale: this change closes the consent workflow issue without broadening behavior for unrelated inbound messages. Additional local peer-boundary hardening can be specified separately.

## Risks / Trade-offs

- Valid peers accidentally configured with the same peer id will be ignored by the host workflow. -> Mitigation: peer ids are required to identify distinct local runtimes; failing closed is safer than allowing self-authorized consent side effects.
- Generic ignored-message diagnostics lose some debugging detail. -> Mitigation: byte length remains available for troubleshooting while preserving secret-safe logging.
- Future authorization workflow message types may need similar local self-authority checks. -> Mitigation: keep helper naming and tests focused so follow-up OpenSpec changes can extend the guard deliberately.
