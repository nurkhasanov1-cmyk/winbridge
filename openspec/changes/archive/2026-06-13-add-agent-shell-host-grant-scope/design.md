## Context

The current host approval flow sets `grantedPermissions` to `request.requestedPermissions`. The protocol/session authorization model permits narrower approvals, and future host UI must let a host approve a subset. The non-native shell can safely exercise this by using a static development option that is validated before any approval is emitted.

## Goals / Non-Goals

**Goals:**

- Add host-only configured grant scope for static and interactive approvals.
- Ensure configured grants are non-empty, unique, valid permissions and a subset of the current viewer request.
- Use the narrowed grant consistently for approval decisions, active state, host workflow state, indicator permission count, audit counts, signal gates, and later revocation checks.
- Fail closed without emitting approval, active state, control, signal, or audit messages when configured grants are not a subset of the request.

**Non-Goals:**

- No dynamic native UI permission checkboxes.
- No account identity, MFA, durable policy, or production RBAC.
- No permission expansion, implicit grants, capture, input execution, clipboard sync, file transfer, diagnostics, reconnect, installer, service, startup persistence, or privilege elevation.

## Decisions

1. **Use an explicit host-only option.**
   - CLI flag: `--grant screen:view,input:pointer`.
   - Runtime option: `hostGrantPermissions?: Permission[]`.
   - The option is valid only for host runtimes that have an approval source: static `approve` or interactive host consent provider.
   - Alternative considered: always grant a fixed permission such as `screen:view`. Rejected because narrowing must be explicit and testable.

2. **Validate request-dependent subset at approval time.**
   - Runtime startup can validate type, uniqueness, host-only use, and approval-source presence.
   - Whether the grant is a subset depends on each inbound request, so the host workflow checks it after inbound request binding gates pass and before any approval/audit messages.
   - Alternative considered: silently intersect configured grants with requested permissions. Rejected because silent intersection could surprise the host and hide misconfiguration.

3. **Use the effective granted permissions everywhere downstream.**
   - Approval decision, visible active state, local authorization snapshots, workflow state, audit detail counts, expiration, pause/resume, revoke, signal authorization, and host indicator all use the effective granted permissions.
   - This makes omitted permissions unavailable immediately and keeps later controls consistent.

## Risks / Trade-offs

- [Risk] Misconfigured grant can leave a request pending with no decision. -> Log a secret-safe skip reason and test that no approval, active state, or audit event is emitted.
- [Risk] Narrowed grants could accidentally allow signal when `screen:view` was not granted. -> Existing signal gates require active visible `screen:view`; add tests for `input:pointer`-only grants blocking signal/probes.
- [Risk] Audit counts could still report requested count as granted count. -> Use effective granted count for approval and activation audit details.
