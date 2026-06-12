## Context

The agent shell accepts absolute `ws:` or `wss:` relay URLs. Earlier hardening centralized relay shared-token handling through the dedicated token field and rejected `token` query parameters in relay URLs. Userinfo credentials are another URL-level credential channel that should not be accepted by the agent shell.

Rejecting URL credentials before connection keeps command lines, config values, and future logs easier to reason about. It also avoids any implicit Basic-auth-like behavior from WebSocket client libraries.

## Goals / Non-Goals

**Goals:**

- Reject `--relay` values with username or password/userinfo credentials before runtime startup.
- Reject direct runtime `relayUrl` values with username or password/userinfo credentials before opening a WebSocket connection.
- Preserve credential-free relay URLs and dedicated relay token support.

**Non-Goals:**

- No production authentication or credential lifecycle design.
- No new identity provider, MFA, token storage, or credential persistence.
- No changes to relay shared-token semantics.
- No changes to consent, authorization, capture, input, clipboard, file transfer, diagnostics, installer, startup, service, or privilege behavior.

## Decisions

1. Reject any non-empty URL `username` or `password`.
   - Rationale: both fields are credential-bearing userinfo and should not be part of the relay URL.
   - Alternative considered: redact or strip userinfo. Rejection is safer because silently changing connection targets can hide operator mistakes.

2. Enforce at both CLI parser and runtime validation layers.
   - Rationale: CLI coverage protects user commands; runtime validation protects tests and programmatic callers.

## Risks / Trade-offs

- Existing local commands using URL userinfo will now fail. Mitigation: WinBridge has no documented userinfo auth flow; relay shared-token access remains through `--token`.

## Migration Plan

Use credential-free `ws:` / `wss:` relay URLs and pass relay shared tokens with `--token` or `AgentShellRuntimeOptions.token`.

## Open Questions

None.
