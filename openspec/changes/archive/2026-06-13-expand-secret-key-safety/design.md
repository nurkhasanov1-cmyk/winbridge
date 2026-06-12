## Context

The shared protocol package is the first validation layer for relay forwarding, agent-shell runtime sends, and audit-event encoding. Current signal safety and audit redaction cover tokens, credentials, API keys, authorization headers, cookies, and private keys, but common cloud or infrastructure aliases such as `accessKey` and `sshKey` are not explicitly covered.

## Goals / Non-Goals

**Goals:**

- Reject `signal.payload` fields whose normalized key names indicate access keys or SSH keys before those messages are accepted or forwarded.
- Redact audit details and protocol `audit-event.detail` fields whose normalized key names indicate access keys or SSH keys.
- Preserve the existing non-secret `authorizationId` exception.
- Cover parse and encode paths with focused unit tests.

**Non-Goals:**

- No protocol shape change.
- No new remote assistance capability.
- No capture, input, clipboard, file transfer, diagnostics, startup, installer, service, persistence, privilege, evasion, bypass, or hidden-session behavior.

## Decisions

- Extend the existing normalized-key indicator lists instead of introducing a new classifier.
  - Rationale: both `messages.ts` and `audit.ts` already normalize keys by removing non-alphanumeric characters and lowercasing, so `accessKey`, `access_key`, and `access-key` can share one indicator.
  - Alternative considered: exact-match checks for each spelling. That is more brittle and duplicates the current normalization pattern.
- Keep `authorizationId` as the only explicit safe authorization-related exception.
  - Rationale: lifecycle authorization ids are intentionally inspectable and already required by signal validation. Broader exceptions would risk allowing secret aliases.
- Use tests at the shared protocol layer.
  - Rationale: relay and agent-shell both depend on these schemas, so protocol tests cover both downstream paths without duplicating behavior in every app.

## Risks / Trade-offs

- Overblocking benign metadata named `accessKey` or `sshKey` -> Acceptable because signal payloads must not carry raw credential-like material; callers can rename safe metadata to non-secret terms.
- Missing future secret aliases -> Mitigated by centralizing the list and adding focused tests as aliases are identified.
- Redaction can hide troubleshooting details -> Acceptable for audit confidentiality; non-secret lifecycle identifiers remain inspectable.
