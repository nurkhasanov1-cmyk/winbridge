## Context

Delayed permission revocation already uses the host workflow state created during visible authorization activation. Direct local host controls need to use the same state so immediate revocation cannot conflict with later delayed revoke, pause, resume, termination, expiration, or disconnect work.

## Design

1. **Expose `revokePermission(permission)` on the managed runtime API.**
   - Only host runtimes can call it.
   - The runtime validates the permission token before workflow checks.
   - The current authorization must be visible, unexpired, and `active` or `paused`.
   - The host workflow state must not be terminal and must include the permission.

2. **Refactor delayed revocation into shared helpers.**
   - Delayed and direct revocation both call one helper that writes the audit record first, mutates workflow state, updates local host authorization snapshot, emits indicator metadata, and sends the existing protocol sequence.
   - Direct revocation does not schedule any new timers.

3. **Preserve pause/resume coherence after direct revocation.**
   - Partial direct revocation keeps the current active or paused status.
   - Final direct revocation sets terminal status `revoked`; later delayed pause, resume, revoke, terminate, expiration, and disconnect checks observe the terminal state and skip.

4. **Keep audit fail-closed.**
   - Direct revocation catches audit/send failures, emits sanitized runtime diagnostics, and throws the generic runtime error.
   - Audit failure happens before workflow mutation or protocol messages.

## Alternatives

- **Use public `send()` for `session-control` revocation.** Rejected because public workflow-authority sends are intentionally blocked to preserve consent and authority gates.
- **Best-effort audit for direct revocation.** Rejected because revocation sends lifecycle messages and can preserve the existing audit-first safety model. Local disconnect remains the exception because it closes the local channel immediately.

## Risks And Mitigations

- Direct control invoked from viewer runtime: reject by role before audit or socket writes.
- Direct control invoked before visibility: reject by authorization snapshot before audit or socket writes.
- Revoking a permission not currently granted: reject before audit or socket writes.
- Audit sink leaks private error text: report only sanitized runtime event/log text with message byte length.
- Direct revocation conflicts with delayed timers: both paths share workflow state and terminal status.
