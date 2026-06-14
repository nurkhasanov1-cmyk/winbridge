## Context

The protocol package already uses one permission vocabulary and rejects future or high-risk permission shapes before they can become requested, granted, revoked, active, or action-authorized scope. The surrounding list validation is duplicated: session grants define their own non-empty unique list schema, authorization transitions parse unique arrays with a local helper, authorization records check uniqueness in schema refinement, and protocol messages use local duplicate checks.

This change is security-sensitive because it touches the authorization scope boundary. It is intended as a maintainability refactor, not a permission model expansion.

## Goals / Non-Goals

**Goals:**

- Centralize permission list max-count and uniqueness handling in `packages/protocol/src/session.ts`, next to `PermissionSchema`.
- Preserve the current permission vocabulary and unavailable permission behavior.
- Preserve existing fail-closed rules for empty grant-bearing scopes, terminal states with permissions, duplicate scopes, and oversized arrays.
- Add focused tests proving representative state-machine, consent-bound grant, and protocol envelope paths share the same list constraints.

**Non-Goals:**

- Do not add new permissions or enable clipboard, file-transfer, diagnostics, remote shell, administrative, persistence, credential, keylogging, stealth, evasion, or prompt-bypass behavior.
- Do not change authorization lifecycle, host visibility, expiration, relay routing, audit sinks, capture, input, native Windows behavior, installer behavior, startup persistence, services, token issuance, or privilege elevation.
- Do not alter user-facing workflow output or protocol envelope shapes.

## Decisions

1. Keep permission list helpers in `session.ts`.

   Rationale: `PermissionSchema` and `Permission` already live there, and `authorization.ts` plus `messages.ts` already depend on `session.ts`. This avoids a new dependency direction and keeps the helper close to the vocabulary.

   Alternative considered: add a new `permissions.ts` module. This is viable, but it would require moving or re-exporting the existing permission vocabulary. For this scoped refactor, a `session.ts` helper minimizes API churn.

2. Preserve context-specific empty-list behavior outside the shared helper when it is lifecycle-specific.

   Rationale: some fields may be empty only for fail-closed terminal states, while grant-bearing transitions require non-empty lists. The shared helper should centralize array parsing, max-count, and uniqueness; lifecycle rules remain with the lifecycle schemas.

3. Keep diagnostics bounded and non-reflective.

   Rationale: permission validation errors should identify the failed field or invariant without echoing raw untrusted values, especially for rejected covert or high-risk permission-shaped strings.

## Risks / Trade-offs

- Refactor accidentally widens scope -> keep `PermissionSchema` unchanged and run focused tests for unavailable and high-risk strings.
- Error message drift -> preserve current intent and update tests only for behavior, not incidental wording.
- Import-cycle risk -> keep helpers in `session.ts` and only import them from existing downstream modules.
- False confidence from helper-only tests -> include representative callers: authorization state machine, consent-bound grant validation, and protocol envelope parsing.

## Migration Plan

1. Add shared permission list helpers next to `PermissionSchema`.
2. Replace local permission list parsing and duplicate checks in authorization and messages.
3. Add focused tests for helper behavior and representative protected schemas.
4. Run focused protocol tests, typecheck, full repo verification, security review, and archive.
