## Context

The protocol currently recognizes `clipboard:read` and `clipboard:write` as
permission strings, but there is no implemented clipboard capability, consent UI
copy, revocation UX, audit persistence contract, data-minimization policy, or
native Windows clipboard integration. Leaving those strings accepted creates a
misleading authorization surface that future code could treat as an available
capability without the required review.

Clipboard data is high-risk because users often copy secrets, credentials,
private messages, recovery codes, and file paths. Until the capability is
specified end-to-end, the correct behavior is to reject clipboard scopes at the
shared permission parser used by authorization, protocol, CLI, and runtime
validation.

## Goals / Non-Goals

**Goals:**

- Reject `clipboard:read` and `clipboard:write` through the shared permission
  schema before authorization state, protocol envelopes, CLI options, runtime
  options, revocations, or action checks can treat them as valid.
- Preserve current working permissions such as `screen:view`, `input:pointer`,
  `input:keyboard`, and `file-transfer`.
- Add tests and documentation that make future clipboard work require an
  explicit OpenSpec change and security review.

**Non-Goals:**

- No clipboard read/write implementation, native Windows API use, sync loop,
  UI, prompt copy, telemetry, file transfer change, or relay routing change.
- No removal of the TypeScript literal knowledge of clipboard strings from
  tests; the runtime validation boundary is the behavior being changed.
- No production account, installer, service, startup, persistence, or privilege
  behavior.

## Decisions

- Keep the closed base permission vocabulary in one module and apply a
  fail-closed refinement for currently unavailable clipboard scopes.
  - Rationale: every shared schema that consumes permissions already routes
    through `PermissionSchema`, so one enforcement point covers authorization
    records, consent-bound grants, protocol messages, CLI parsing, runtime
    options, and direct action checks.
  - Alternative considered: remove clipboard strings from the enum entirely.
    Rejected for this step because negative tests and future reviewed clipboard
    work still benefit from a visible unavailable set while runtime parsing
    rejects it.
- Test both shared protocol and agent-shell entry points.
  - Rationale: external input can arrive as local helper calls, decoded protocol
    envelopes, CLI arguments, or direct managed runtime options.
- Document the freeze near the existing diagnostics boundary.
  - Rationale: maintainers should see that clipboard is intentionally
    unavailable, not accidentally unimplemented.

## Risks / Trade-offs

- [Risk] Future clipboard work must update these tests and specs. -> Mitigation:
  that is intentional; clipboard access should require a new OpenSpec change,
  abuse-case review, host UX, audit, revocation, and data-handling design.
- [Risk] A zod refinement can change type inference ergonomics. -> Mitigation:
  keep a base permission type internally if needed and verify `npm run check`.
- [Risk] Existing tests or fixtures may use clipboard as a benign sample
  permission. -> Mitigation: update those tests to assert rejection or switch
  benign samples to implemented permissions.
