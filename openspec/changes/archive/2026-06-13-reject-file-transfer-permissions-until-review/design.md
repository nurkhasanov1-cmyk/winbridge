## Context

The protocol still recognizes `file-transfer` as a permission string, but the
bootstrap product explicitly does not transfer files. There is no host-facing
consent copy, file picker, transfer policy, audit persistence schema,
malware/content handling, path redaction policy, or native Windows file
integration.

File transfer is a high-risk data movement channel. Treating `file-transfer` as
accepted authorization scope before an end-to-end design could let future code
mistake a placeholder permission for a reviewed capability.

## Goals / Non-Goals

**Goals:**

- Reject `file-transfer` through the shared permission schema before
  authorization state, protocol envelopes, CLI options, runtime options,
  revocations, or action checks can treat it as valid.
- Preserve current working permissions such as `screen:view`, `input:pointer`,
  and `input:keyboard`.
- Keep the freeze documented and covered by tests so future file-transfer work
  must update OpenSpec deliberately.

**Non-Goals:**

- No file upload/download implementation, filesystem reads, path handling, file
  picker, native Windows APIs, malware scanning, resumable transfer protocol, or
  transfer UI.
- No relay routing change, production account behavior, installer behavior,
  service, startup persistence, privilege behavior, or hidden access.
- No removal of the TypeScript literal knowledge of `file-transfer` from tests;
  runtime validation remains the behavior being changed.

## Decisions

- Add `file-transfer` to the existing unavailable permission set enforced by
  `PermissionSchema`.
  - Rationale: authorization helpers, protocol envelopes, CLI parsing, runtime
    options, host control prompt parsing, consent-bound grants, and direct
    action checks already route through this parser.
  - Alternative considered: remove `file-transfer` from the base enum. Rejected
    for this step because keeping the literal available for negative tests and
    future reviewed work makes the freeze explicit.
- Keep tests parallel to the clipboard freeze.
  - Rationale: file transfer and clipboard are both sensitive data channels
    without current implementation; the same fail-closed coverage pattern
    reduces divergence.
- Update docs near clipboard and diagnostics guidance.
  - Rationale: maintainers should see this is an intentional capability freeze,
    not an accidental missing feature.

## Risks / Trade-offs

- [Risk] Future file-transfer work must update tests and specs. -> Mitigation:
  that is intentional; file movement requires explicit consent, revocation,
  audit, abuse-case, and data-handling review.
- [Risk] Existing fixtures may use `file-transfer` as a benign sample
  permission. -> Mitigation: update those fixtures to use implemented
  permissions when they are not testing file transfer.
- [Risk] A broad unavailable set can obscure which permissions remain usable. ->
  Mitigation: document current available permissions and keep focused tests for
  accepted screen/input permissions.
