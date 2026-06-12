## Context

WinBridge currently treats the development relay shared token as a local/private bootstrap gate, not production authentication. The relay already rejects blank, control-character, non-string, and oversized configured tokens, and the agent shell keeps tokens out of logs and runtime events. However, surrounding whitespace is accepted, which can make credentials visually ambiguous in environment variables, CLI invocations, and test fixtures.

## Goals / Non-Goals

**Goals:**

- Reject untrimmed configured relay shared tokens before relay listener startup.
- Reject untrimmed agent shell token options before opening a relay connection.
- Preserve exact token comparison for accepted token values.
- Preserve secret-safe diagnostics, logs, audit records, and close reasons.

**Non-Goals:**

- No production account identity, MFA, token rotation, durable token storage, or RBAC.
- No automatic token trimming or rewriting.
- No changes to pairing code lifecycle, relay room admission after token validation, session authorization, screen capture, remote input, clipboard, file transfer, installer behavior, startup persistence, services, privilege elevation, or Windows native APIs.

## Decisions

1. Reject untrimmed tokens instead of trimming them.
   - Rationale: the relay shared token is credential material. Silent normalization could make a misconfigured token look accepted while hiding the producer/configuration defect.
   - Alternative considered: trim tokens at relay and agent boundaries. Rejected because exact credential comparison should remain explicit and auditable.

2. Apply the same canonical rule at both relay and agent boundaries.
   - Rationale: relay env/runtime configuration and agent CLI/direct runtime options are separate entry points. Each should fail before opening listeners or connections.
   - Alternative considered: enforce only on the relay. Rejected because agent-side validation prevents secret-bearing ambiguous values from reaching connection setup and keeps local diagnostics predictable.

3. Keep diagnostics generic.
   - Rationale: rejected token values are secrets. Error messages, runtime events, audit details, close reasons, and logs must identify the malformed condition without echoing raw token bytes.
   - Alternative considered: include token length or whitespace side in diagnostics. Rejected because even metadata about secret shape is unnecessary for this development gate.

## Risks / Trade-offs

- [Risk] Existing local development scripts that intentionally use leading or trailing token spaces will fail. -> Mitigation: use the same token without surrounding whitespace.
- [Risk] This hardening could be mistaken for production authentication. -> Mitigation: docs and specs continue to identify shared tokens as a development-only gate and keep production identity out of scope.
