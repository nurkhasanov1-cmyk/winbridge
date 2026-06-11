## Context

`SessionAuthorizationSchema` is the shared parser for authorization records, including data that may be loaded from storage or received through development APIs. State-machine helpers already enforce most safety rules when they create transitions, but direct schema parsing still accepts malformed records that helper paths would never produce.

## Goals / Non-Goals

**Goals:**

- Make schema parsing fail closed for malformed authorization lifecycle records.
- Keep state-machine helper output valid under the hardened schema.
- Preserve terminal fail-closed records, including revoked records with an empty permission list.
- Cover external-record parsing with focused unit tests.

**Non-Goals:**

- No new remote access permissions or capabilities.
- No changes to capture, input injection, relay signaling, installer, services, startup, tokens, or privilege elevation.
- No persistence migration beyond the bootstrap protocol schema shape.

## Decisions

- Use a `superRefine` layer on the existing Zod object instead of a separate validator. This keeps every caller of `SessionAuthorizationSchema.parse(...)` on the same safety path and avoids requiring downstream code to remember a second guard.
- Add timestamp fields for terminal states that currently do not have dedicated fields (`deniedAt`, `expiredAt`). This makes terminal records auditable without changing action authorization behavior.
- Validate permissions by status rather than globally requiring a non-empty array. Pending, approved, active, and paused records must have at least one permission; revoked records may be empty after the final permission is removed; other terminal records remain fail-closed by status.
- Require `visibleToHost` only for `active` and `paused`. Terminal records may preserve historical visibility state, but action checks still deny by terminal status.

## Risks / Trade-offs

- Existing malformed fixtures or persisted bootstrap data may stop parsing. Mitigation: this project is still in bootstrap scope, and tests will be updated to generate valid lifecycle records.
- Zod issue messages can be less specific than helper-level errors. Mitigation: add explicit custom messages for each invariant so failures are actionable.
- Schema hardening does not replace transition helpers. Mitigation: keep transition tests and add direct schema parse tests for externally constructed records.
