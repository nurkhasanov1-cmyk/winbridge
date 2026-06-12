## Context

WinBridge currently validates display names as non-empty and bounded. Those display names are not production identity, but they are user-visible metadata used by consent and peer presence workflows. Leading or trailing whitespace can make the same name appear different to machines while appearing similar to a host user.

## Goals / Non-Goals

**Goals:**

- Enforce canonical display-name strings at the shared protocol schema boundary.
- Ensure relay and agent-shell behavior remains fail-closed and secret-safe when display names are malformed.
- Keep generated default names unchanged because they are already canonical.

**Non-Goals:**

- No production identity, account binding, MFA, or trust model changes.
- No remote action, screen capture, input, clipboard, file transfer, reconnect, installer, service, startup, privilege, token, or native Windows API changes.
- No automatic trimming or rewriting of peer-declared names.

## Decisions

1. Reject untrimmed display names instead of trimming them during parsing.
   - Rationale: display names are peer-declared metadata. Silently rewriting them can hide ambiguous input and create different raw/audited/user-visible values.
   - Alternative considered: normalize by trimming. Rejected because fail-closed validation is easier to reason about at security-relevant boundaries.

2. Implement the rule in `DeviceDisplayNameSchema`.
   - Rationale: the same schema already backs device identity, `hello.displayName`, and legacy consent request `viewerDisplayName`, so this keeps relay and agent-shell behavior aligned.
   - Alternative considered: add local checks in each app. Rejected because it would duplicate policy and risk drift.

3. Add tests at protocol, relay, CLI, runtime-option, inbound, and public-send boundaries.
   - Rationale: unit tests prove the shared schema, while integration tests prove malformed display names are not forwarded, accepted as peer presence, or emitted in trusted local events.

## Risks / Trade-offs

- [Risk] Existing local scripts that pass padded names will now fail. -> Mitigation: this is a development metadata contract, and callers can pass the same name without surrounding whitespace.
- [Risk] Stricter display-name validation could be mistaken for production authentication. -> Mitigation: specs continue to state that device/display-name metadata is not production account identity and never grants remote action access.
