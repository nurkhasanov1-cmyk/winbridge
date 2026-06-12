## Context

The shared protocol schema already treats access-key and SSH-key field names as sensitive signal payload metadata. Relay runtime integration coverage currently proves rejection for several authentication, content, diagnostics, and keylogging payload keys, but it does not explicitly prove that the relay boundary rejects access-key and SSH-key shapes before forwarding or audit exposure.

## Goals / Non-Goals

**Goals:**

- Prove that registered relay peers cannot forward `signal` payloads containing access-key or SSH-key field names.
- Prove that the relay rejection and audit metadata remain bounded and omit raw key values.
- Keep the relay dependent on shared protocol validation rather than duplicating sensitive-key parsing.

**Non-Goals:**

- No new protocol message type, permission, capture, input, clipboard, file transfer, diagnostics collection, native Windows API, installer, startup, service, or privilege behavior.
- No changes to the sensitive-key detection algorithm unless tests expose a gap.
- No production authentication model changes.

## Decisions

- Add relay integration coverage instead of a relay-specific parser.
  The protocol package is the canonical validation layer for `signal.payload`; duplicating the key list in relay code would increase drift risk. The relay test should exercise the runtime path from WebSocket input through relay rejection and audit recording.

- Keep the peer-facing expectation generic.
  The existing relay error reason is bounded and intentionally does not include the offending field path or value. The test should assert the generic sensitive-data rejection and absence of raw values, not exact Zod internals.

## Risks / Trade-offs

- Test-only implementation may miss a future schema drift if relay stops using shared validation.
  Mitigation: the integration test drives the actual relay WebSocket path and verifies that the remaining peer receives no forwarded `signal`.

- The test adds another relay integration scenario.
  Mitigation: keep it scoped to one paired session and reuse existing helpers.
