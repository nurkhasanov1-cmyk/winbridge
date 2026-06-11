## Context

The current relay is a development WebSocket relay. It supports an optional shared token, validates protocol envelopes, and emits structured audit records. It still needs a basic local throttle for repeated failed attempts.

## Goals / Non-Goals

**Goals:**

- Throttle repeated invalid token attempts by remote address.
- Throttle repeated malformed or rejected messages by registered peer or remote address.
- Emit audit metadata showing whether a failure was rate-limited.
- Keep secrets out of logs.

**Non-Goals:**

- No distributed rate limiting.
- No production abuse service.
- No CAPTCHA, account lockout, IP reputation, or WAF integration.
- No change to remote-control capabilities.

## Decisions

1. **Use an in-memory sliding-window limiter.**
   - Rationale: It is simple, testable, and appropriate for a single-process development relay.
   - Alternative considered: Redis or external store. That belongs in production relay design.

2. **Fail closed after the limit is exceeded.**
   - Rationale: Repeated invalid attempts should not keep consuming relay work.
   - Alternative considered: Continue accepting but only audit. That does not reduce load or abuse attempts.

3. **Key by remote address before identity exists, and by peer id after registration.**
   - Rationale: Invalid token attempts happen before protocol identity exists; malformed messages after join can use peer identity.
   - Alternative considered: Key by session id only. That could let one peer affect another in the same session.

## Risks / Trade-offs

- **Risk: In-memory limiter resets on restart.** -> Mitigation: This is development-only; production abuse protection requires a future OpenSpec change.
- **Risk: NAT/shared address false positives.** -> Mitigation: Defaults are modest and configurable through environment variables.
- **Risk: Audit details leak secrets.** -> Mitigation: Only booleans/counts are logged; audit redaction remains in place.

## Migration Plan

1. Add rate limiter and unit tests.
2. Integrate token and message failure paths.
3. Update docs.
4. Run verification, archive, commit, and push.
