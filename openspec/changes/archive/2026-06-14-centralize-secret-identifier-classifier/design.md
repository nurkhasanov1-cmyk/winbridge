## Context

Protocol identifier validation currently protects several surfaces from treating raw secret material as trusted metadata: audit records, protocol audit-event envelopes, authorization identifiers, audit detail `authorizationId` redaction, and consent-bound grants. The same marker family is duplicated in `audit.ts` and `session.ts`, while other modules import the audit helper. This works today, but it makes future marker updates easy to apply in one path and miss in another.

The change is security-sensitive because it touches auth and audit/log validation, but it does not create capture, input, relay, installer, startup, service, token, or privilege behavior.

## Goals / Non-Goals

**Goals:**

- Use one shared helper for secret-bearing protocol identifier metadata detection.
- Preserve existing public helper availability for callers that import it through the audit module or package barrel.
- Keep validation diagnostics bounded and unchanged in spirit: reject unsafe identifiers without reflecting raw values.
- Add focused regression tests showing the audit and grant validation paths share the same marker-family classifier.

**Non-Goals:**

- Do not change the protocol identifier shape, max length, permission vocabulary, authorization lifecycle, relay routing, audit sinks, capture, input, native Windows behavior, installer behavior, startup persistence, services, token issuance, or privilege elevation.
- Do not broaden secret detection for free-text audit/action/reason metadata; this change is only for protocol-facing identifier metadata.

## Decisions

1. Add `packages/protocol/src/identifier-metadata.ts` as a leaf module.

   Rationale: a small leaf module avoids importing `audit.ts` from `session.ts` and prevents a protocol dependency cycle. It also gives `messages.ts` and `authorization.ts` a direct source for identifier classification instead of relying on audit as the owner of all security metadata helpers.

   Alternative considered: keep the helper in `audit.ts` and import it from `session.ts`. That was rejected because `audit.ts` imports session schemas, so the dependency direction would be fragile.

2. Re-export the existing helper name from `audit.ts`.

   Rationale: `hasSecretBearingProtocolIdentifierMetadata` is already an exported protocol API through `audit.ts` and `index.ts`. Re-exporting preserves existing imports while moving ownership into the leaf module.

   Alternative considered: make consumers import only from the new module. That would be cleaner internally but risks breaking callers that already use the package barrel or audit module export.

3. Keep marker semantics unchanged and cover alignment with tests.

   Rationale: the purpose is to remove drift, not change which safe or unsafe identifiers pass validation. Tests should compare audit identifier rejection and consent-bound grant rejection against the same representative marker family set.

   Alternative considered: expand the marker family during the refactor. That would mix behavior change with a maintainability change and require broader spec updates.

## Risks / Trade-offs

- Import-cycle risk -> keep the helper module independent from audit, messages, authorization, and session.
- Public API drift -> re-export the helper from `audit.ts` and keep the package barrel behavior intact.
- False sense of coverage -> add tests for every current marker family across the shared helper and representative protected schemas, then run full protocol and repo checks.
- Refactor accidentally changes security behavior -> keep marker strings identical and verify existing audit, message, authorization, and session tests still pass.

## Migration Plan

1. Add the leaf helper module and update internal imports.
2. Replace the local session grant marker list with the shared helper.
3. Preserve public exports and run focused protocol tests.
4. Run full check, test, build, and OpenSpec validation before archiving.
