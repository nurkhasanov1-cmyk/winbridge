## Context

WinBridge uses development shared tokens for the local relay and the agent shell. Existing validation rejects blank, untrimmed, oversized, non-string, and ASCII-control token values, but it does not reject Unicode format controls that can visually hide or reorder token text in configuration files and terminals.

## Goals / Non-Goals

**Goals:**

- Reject bidirectional and zero-width formatting controls in relay shared-token configuration.
- Reject the same controls in agent shell CLI and direct runtime token options.
- Keep all failures before listener startup or relay connection setup.
- Keep diagnostics secret-safe and avoid logging raw token text.

**Non-Goals:**

- No production account authentication, token issuance, rotation, MFA, RBAC, or device trust changes.
- No protocol schema, relay forwarding, consent approval, screen capture, input, clipboard, file transfer, reconnect, installer, service, startup, or privilege behavior changes.

## Decisions

- Use the same explicit code-point denylist already used for display-name format controls: Arabic Letter Mark, zero-width controls, bidi isolates, bidi embeddings, overrides, marks, and word joiner.
- Keep validation local to the relay and agent token paths instead of introducing a new shared dependency or changing protocol schemas.
- Treat these values as malformed configuration/CLI/runtime options, not as authentication attempts. Rejections happen before sockets or relay connections are opened.
- Keep error messages generic and policy-oriented; do not include the rejected token value or whitespace/control shape.

## Risks / Trade-offs

- Existing local scripts using invisible token characters will fail after the change. Mitigation: this is intentional hardening for development secrets; visible ASCII tokens continue to work.
- The denylist is explicit rather than a broad Unicode category ban. Mitigation: it targets the known invisible/direction-changing controls without blocking ordinary visible Unicode token characters.
- The same logic is duplicated in relay and agent modules. Mitigation: this avoids expanding public protocol APIs for a local validation helper and keeps the patch small.
