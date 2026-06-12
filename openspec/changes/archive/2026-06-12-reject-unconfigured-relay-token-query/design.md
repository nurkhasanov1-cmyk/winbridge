## Context

The relay supports an optional local development shared token. With a configured token, clients must present exactly one matching `token` query parameter before the relay processes a join. Without a configured token, the relay starts in documented development mode, but currently token-bearing client URLs are accepted and the token value is ignored.

That behavior is not production authorization, but it is still a security boundary signal. A caller that passes `?token=...` to an unconfigured relay may believe access is token-protected when it is not.

## Goals / Non-Goals

**Goals:**

- Fail closed when a relay client presents any `token` query parameter but the relay has no configured shared token.
- Keep rejection diagnostics bounded and secret-safe.
- Preserve existing configured-token behavior, including duplicate-token rejection.
- Document that omitted shared-token mode is open local development mode and does not accept token-bearing client URLs.

**Non-Goals:**

- Add production authentication, account identity, device trust, token lifecycle, or RBAC.
- Change pairing semantics or grant remote permissions.
- Implement screen capture, input, clipboard, file transfer, installer behavior, services, startup persistence, or privilege elevation.

## Decisions

- Reject unconfigured token presentation before room join.
  - Rationale: silent ignore is ambiguous and can hide configuration mistakes.
  - Alternative considered: keep accepting the connection but log a warning. That still allows a misconfigured client to proceed as if token authorization were active.

- Reuse the token-denial audit path.
  - Rationale: the event is about access-token boundary failure, and the existing record already avoids raw token values.
  - Alternative considered: emit a new audit action. That would add more surface area without a meaningfully different operational response for the current development relay.

- Use a bounded peer-facing close reason distinct from wrong-token denial.
  - Rationale: callers should know the relay is not configured for token access without seeing the token value.
  - Alternative considered: return the generic invalid-token reason. That is safe, but less useful for diagnosing the specific configuration mistake.

## Risks / Trade-offs

- Existing local scripts that pass `--token` to an unconfigured relay will fail earlier.
  - Mitigation: docs will state that clients must omit tokens when the relay runs in open development mode or configure the relay shared token explicitly.

- This does not make development mode production-safe.
  - Mitigation: retain the existing development-mode warning and documentation that production requires stronger identity and authorization.
