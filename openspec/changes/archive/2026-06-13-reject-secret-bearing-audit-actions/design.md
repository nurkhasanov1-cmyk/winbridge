## Context

WinBridge already redacts sensitive audit `detail` fields and sensitive top-level audit `reason` text before records are stored, emitted, or forwarded through development protocol messages. The remaining gap is audit `action`: both local audit records and protocol `audit-event` messages validate action shape, but preserve the string as-is after validation.

This change touches logs, protocol validation, and relay forwarding. It does not add remote access behavior; it tightens secret handling for existing audit metadata.

## Goals / Non-Goals

**Goals:**

- Reject secret-bearing action strings in shared audit record creation.
- Reject secret-bearing protocol `audit-event.action` strings during parse and encode.
- Ensure relay forwarding rejects invalid `audit-event` messages before delivery and emits only bounded secret-safe rejection metadata.
- Keep non-secret dotted action names valid.

**Non-Goals:**

- No new audit action taxonomy or action allowlist.
- No changes to host consent, visibility, capture, input, installer, service, startup, persistence, or privilege behavior.
- No attempt to infer every possible secret by entropy; this change covers explicit secret-bearing markers already used by the audit redaction model.

## Decisions

1. Reuse the audit reason secret-marker model for action validation.

   Rationale: the existing reason redaction logic already identifies raw token, credential, pairing-code, authorization, cookie, key, remote-content, and diagnostics patterns in bounded text. Applying the same classes to action validation closes the bypass without introducing a separate policy.

   Alternative considered: redact action strings instead of rejecting them. Rejection is safer because action is a fixed audit classifier; redacting it would produce low-value records and could hide malformed peer input.

2. Keep protocol and audit-record action schemas separate, but share the secret predicate.

   Rationale: local audit records currently allow up to 160 characters while protocol `audit-event.action` allows up to 120. Sharing only the predicate avoids loosening protocol constraints.

   Alternative considered: export and reuse one full action schema. That would either loosen protocol length or tighten local audit length, making this change broader than needed.

3. Preserve bounded validation and relay errors.

   Rationale: invalid action input can originate from a peer. Validation errors, relay errors, and rejection audit records must identify the failure class without echoing attacker-controlled action text.

## Risks / Trade-offs

- [Risk] Pattern-based detection can reject an action that looks like `token raw-value` even if intended as a classifier. -> Mitigation: dotted lifecycle action names such as `relay.token.denied` remain valid, and free-form values do not belong in action metadata.
- [Risk] Future sensitive marker categories could drift between reason redaction and action rejection. -> Mitigation: centralize the predicate in the audit module and test both local and protocol paths.
