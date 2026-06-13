## Context

WinBridge uses structured audit detail metadata for relay decisions, consent workflow events, and development file sinks. Detail values are JSON-canonicalized and sensitive values are redacted by key name. Semantic audit fields now reject unsafe control and formatting characters, but extensible detail keys still allow invisible or directional formatting characters.

## Goals / Non-Goals

**Goals:**

- Reject ASCII control characters in audit detail property names.
- Reject Unicode bidi and zero-width formatting controls, including `U+FEFF`, in audit detail property names.
- Apply validation recursively to nested objects in audit records and protocol `audit-event.detail`.
- Keep rejection diagnostics generic and free of raw key names or raw detail values.
- Preserve existing detail value JSON compatibility and redaction behavior for safe keys.

**Non-Goals:**

- No automatic normalization, key rewriting, or repair of malformed detail metadata.
- No change to signal payload key rules in this increment.
- No new remote assistance capability or production authentication/authorization mechanism.

## Decisions

- Validate audit detail keys after JSON canonicalization and before recursive redaction.
  - Rationale: canonicalization already removes prototype/accessor/symbol traps; key validation should run on the same trusted snapshot before persistence or forwarding.

- Keep issue messages generic and avoid Zod paths for unsafe keys.
  - Rationale: Zod paths can include the raw key name; audit rejection diagnostics must stay secret-safe.

- Scope validation to audit detail metadata by extending `AuditDetailSchema`.
  - Rationale: protocol `audit-event.detail` imports the same schema, so the audit record and protocol boundary share one contract without broadening this change to all JSON payloads.

## Risks / Trade-offs

- [Risk] Some local tooling could emit accidental control characters in custom detail keys. -> Mitigation: fail closed because audit key names must be unambiguous.
- [Risk] Rejecting only audit detail keys leaves signal payload keys unchanged. -> Mitigation: this change is intentionally scoped to audit/log metadata; signal payload key policy can be handled separately if needed.
- [Risk] This touches audit/log paths. -> Mitigation: run focused tests, full gates, strict OpenSpec validation, and security review before archive.
