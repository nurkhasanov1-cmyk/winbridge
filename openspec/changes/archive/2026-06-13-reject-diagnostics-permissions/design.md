## Context

The shared protocol currently defines a closed `PermissionSchema` for
implemented or explicitly modeled remote-assistance scopes. Diagnostics is
called out in documentation as sensitive, but there is no diagnostics permission,
authorization lifecycle, UI, audit persistence contract, or Windows
implementation.

Because diagnostics can expose logs, environment details, device state, or
operator metadata, treating a diagnostics-shaped string as a generic permission
would be a fail-open expansion of the product scope.

## Goals / Non-Goals

**Goals:**

- Prove diagnostics-shaped permissions are rejected by the shared authorization
  state machine and protocol message schemas.
- Keep diagnostics unavailable until a future OpenSpec change defines consent,
  host visibility, revocation, audit, and abuse-case requirements.
- Document the current deny-by-default boundary for maintainers.

**Non-Goals:**

- No diagnostics permission enum value.
- No diagnostics UI, CLI command, telemetry, log viewing, native Windows API, or
  production account feature.
- No change to existing screen, input, clipboard, or file-transfer permissions.

## Decisions

- Keep `PermissionSchema` unchanged and add explicit regression tests that cast
  external input through the runtime schemas.
  - Rationale: the current closed enum is the correct enforcement point; tests
    make the intended absence of diagnostics access visible.
  - Alternative considered: add `diagnostics:view` with no implementation.
    Rejected because a recognized permission can be mistaken for authorized
    capability in future adapters.
- Cover both state-machine helpers and wire-message schemas.
  - Rationale: external input can enter through local state construction,
    received protocol envelopes, or consent-bound grant records.

## Risks / Trade-offs

- [Risk] Future diagnostics work will need to update tests and specs. ->
  Mitigation: that is intentional; adding diagnostics must be explicit and
  reviewed through OpenSpec.
- [Risk] Tests only prove schema rejection, not a runtime diagnostics feature. ->
  Mitigation: there is no runtime diagnostics capability in scope; this change
  preserves that absence.
