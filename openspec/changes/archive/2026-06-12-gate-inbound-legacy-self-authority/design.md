## Context

The managed agent shell has a pre-event inbound filtering pipeline. It ignores cross-session messages, self-hello, foreign relay-ready, self-disconnect notices, misdirected signals, and self-authority workflow messages before emitting local `received` events or workflow summary logs.

The current self-authority workflow filter covers `session-authorization-decision`, `session-authorization-state`, `session-control`, `permission-revoked`, and `audit-event`. It does not explicitly cover the legacy grant-bearing `host-consent-decision` message.

## Goals / Non-Goals

**Goals:**

- Treat inbound legacy `host-consent-decision` with `hostPeerId` equal to the local runtime peer as self-authority workflow input.
- Ignore that input before local `received` events and received workflow summary logs.
- Keep diagnostics metadata-only and secret-safe.
- Keep `host-consent-required` request behavior unchanged.

**Non-Goals:**

- No new protocol message shapes.
- No production identity/authentication changes.
- No native capture/input/clipboard/file-transfer implementation.
- No installer, service, startup, persistence, credential, or privilege-elevation behavior.

## Decisions

- Extend the existing `isSelfAuthorityWorkflowMessage()` predicate.
  - Rationale: this predicate is the established pre-event boundary for self-origin authority metadata. Adding the legacy message here keeps policy centralized.
  - Alternative considered: add a separate legacy-only predicate. Rejected because it would duplicate the same boundary and make future authority coverage harder to audit.

- Verify through the existing self-authority test server.
  - Rationale: the current test already exercises the exact inbound path and asserts no local `received` events, no workflow summary logs, and redacted raw events.
  - Alternative considered: write a separate server/test only for legacy consent. Rejected because the existing matrix is simpler and keeps all self-authority variants together.

## Risks / Trade-offs

- Legacy request/decision confusion -> Mitigation: only gate `host-consent-decision` by `hostPeerId`; do not gate `host-consent-required`.
- Diagnostics leakage -> Mitigation: test with private reason and raw-token markers and assert logs/events remain redacted.
- Over-broad filtering could hide legitimate remote host decisions from a viewer -> Mitigation: predicate matches only the local runtime peer id, so a viewer receiving a decision from a distinct host remains unaffected.
