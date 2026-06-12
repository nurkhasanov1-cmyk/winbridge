## Context

The relay reads its shared token from the WebSocket query string. The agent shell currently appends `options.token` to the relay URL internally and logs only safe connection metadata. However, callers can also provide `token` inside the relay URL itself.

Centralizing token input through the existing `--token`/`options.token` path makes validation and future redaction easier to reason about. It also aligns with README guidance that peers should pass the relay shared token with `--token`.

## Goals / Non-Goals

**Goals:**

- Reject `--relay` values containing a `token` query parameter before runtime startup.
- Reject direct runtime `relayUrl` values containing a `token` query parameter before opening a WebSocket connection.
- Preserve successful token-protected relay connections when the dedicated token field is used.

**Non-Goals:**

- No production authentication or token lifecycle design.
- No new identity provider, MFA, token storage, or credential persistence.
- No changes to relay shared-token semantics.
- No changes to consent, authorization, capture, input, clipboard, file transfer, diagnostics, installer, startup, service, or privilege behavior.

## Decisions

1. Reject only the exact query key `token`.
   - Rationale: this is the relay's current shared-token query key and avoids broad URL policy changes.
   - Alternative considered: reject all query strings. That would be stricter but could block future non-secret routing metadata unnecessarily.

2. Enforce at both CLI parser and runtime validation layers.
   - Rationale: CLI coverage protects user commands; runtime validation protects tests and programmatic callers.
   - Alternative considered: CLI-only validation. That would leave direct runtime construction inconsistent.

## Risks / Trade-offs

- Existing local commands that embed `?token=...` in `--relay` will now fail. Mitigation: `--token` remains supported and documented.

## Migration Plan

Use `--token <shared-token>` or `AgentShellRuntimeOptions.token` instead of adding `?token=` to the relay URL.

## Open Questions

None.
