## Context

The relay shared token is a local/private development gate. It is not production identity or authorization, but it is still a sensitive value used before peer registration. Relay callers can configure it through `WINBRIDGE_RELAY_SHARED_TOKEN` or direct `createRelayRuntime({ sharedToken })`; agent-shell callers can pass it through CLI `--token` or direct runtime `token`.

Current validation rejects blank tokens and keeps tokens out of logs/events, but direct values are not consistently type-checked or bounded by byte length/control characters before relay or agent connection setup.

## Goals / Non-Goals

**Goals:**

- Reject malformed development shared-token values before relay listener startup or agent relay connection setup.
- Preserve omitted-token development mode.
- Preserve exact token value semantics for valid padded strings.
- Keep token rejection errors generic and avoid logging raw token values.

**Non-Goals:**

- No production account identity, MFA, RBAC, bearer-token lifecycle, device trust, reconnect, or durable session authorization.
- No change to shared-token query parameter placement or exact-match semantics.
- No changes to consent, authorization state machine, capture, input, clipboard, file transfer, diagnostics, installer, startup, service, persistence, privilege elevation, or Windows prompt behavior.

## Decisions

1. Bound tokens by UTF-8 byte length rather than JavaScript string length.
   - Rationale: the token is transmitted as URL query content, and byte length better represents transport pressure.
   - Alternative considered: character count only. Rejected because multibyte values can exceed intended transport bounds.

2. Reject ASCII control characters while preserving spaces and padded valid tokens.
   - Rationale: existing behavior permits padded tokens and exact matching. Control characters add ambiguity in URLs, logs, terminals, and diagnostics without improving development authorization.
   - Alternative considered: trim tokens or restrict to a narrow ASCII token alphabet. Rejected to avoid changing valid exact-match semantics more than necessary.

3. Keep relay and agent validation local to their entrypoints.
   - Rationale: the shared token is not part of the protocol envelope contract. A future production auth change can introduce a shared auth package if token lifecycle becomes broader.

## Risks / Trade-offs

- Existing local scripts using control characters or tokens larger than 1024 UTF-8 bytes will now fail early. Mitigation: use a non-blank token within the documented development bound and avoid ASCII control characters.
- This does not make the development shared token production authorization. Mitigation: docs and specs continue to state that production identity/authorization is future work.

## Migration Plan

Use omitted token configuration for local development mode, or configure a non-blank development token of 1024 UTF-8 bytes or less with no ASCII control characters through `WINBRIDGE_RELAY_SHARED_TOKEN` and agent `--token`.

## Open Questions

None.
