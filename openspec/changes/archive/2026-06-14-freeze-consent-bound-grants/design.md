## Context

`assertConsentBoundGrant` is the shared guard that accepts only consent-bound grants with explicit host approval, visible-session requirement, non-empty unique permissions, and future expiration. These grants are plain JavaScript objects after `SessionGrantSchema.parse(...)`.

Authorization records now return immutable snapshots. Consent-bound grants should follow the same runtime safety contract so a validated grant cannot be widened or weakened before future adapters enforce it.

## Goals / Non-Goals

**Goals:**

- Freeze the grant object returned by `assertConsentBoundGrant`.
- Freeze nested grant data, especially `permissions`.
- Keep `SessionGrantSchema.parse(...)` behavior and serialized shape unchanged.
- Add focused tests for mutation attempts against permission scope, host-approval requirement, and visible-session requirement.

**Non-Goals:**

- No TypeScript-wide readonly migration.
- No change to permission vocabulary, authorization state transitions, protocol messages, relay behavior, capture, input, clipboard, file transfer, diagnostics, installer, services, startup persistence, credentials, keylogging, evasion, or Windows prompts.

## Decisions

1. Freeze after schema parse and expiration check.

   The grant should become immutable only after all validation has succeeded. Expired or malformed grants continue to throw exactly as before.

2. Use a local recursive freezer in `session.ts`.

   The module is small and has no shared utility for immutable parsed values. A local helper avoids adding a dependency or coupling session grants to the authorization module.

3. Preserve mutable schema parse semantics.

   Only `assertConsentBoundGrant` promises an enforcement-ready grant snapshot. The raw exported Zod schema remains a parser for callers that need schema-level validation.

## Risks / Trade-offs

- Existing callers that mutate returned grants will now fail at runtime -> Current repository search shows no valid dependency on mutation, and failing closed is the desired safety behavior.
- Recursive freeze has small overhead -> Grants are small and not in a high-frequency data path.
- Compile-time readonly types would document the contract more strongly -> Deferred to keep this hardening narrowly scoped.
