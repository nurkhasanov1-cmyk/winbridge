## Context

Audit records are used for failure-path diagnostics and security traceability. Structured `detail` metadata is already redacted for access-key and SSH-key aliases, but the top-level `reason` redaction regex still focuses on earlier secret classes such as tokens, API keys, authorization headers, cookies, and private keys.

## Goals / Non-Goals

**Goals:**

- Redact top-level audit `reason` strings that expose access-key or SSH-key material.
- Keep existing bounded safe reason strings unchanged.
- Cover both colon/equals and whitespace-separated marker forms.

**Non-Goals:**

- No audit schema shape change.
- No new remote assistance capability.
- No capture, input, clipboard, file transfer, diagnostics, installer, service, startup, persistence, privilege, evasion, bypass, or hidden-session behavior.

## Decisions

- Extend the existing reason marker regex.
  - Rationale: reason redaction already uses marker-based detection for secret labels followed by values; access-key and SSH-key labels fit that model.
  - Alternative considered: route reasons through the structured detail key classifier. That would blur value-level pattern checks with key-level detail redaction and is unnecessary for this narrow change.
- Preserve the fixed safe-reason allowlist.
  - Rationale: operational reason codes such as `Invalid relay token` are bounded metadata and should remain inspectable.

## Risks / Trade-offs

- False positives for free-form text mentioning access keys or SSH keys with a following value -> Acceptable because audit reasons should not carry raw credential-like material.
- Future aliases still require explicit coverage -> Mitigated by keeping this check centralized in the audit layer.
