## Context

The non-native agent shell is the current consent workflow exerciser. It emits protocol-level `audit-event` messages for host approval, denial, visible activation, revocation, pause, resume, termination, and expiration. The reusable `@winbridge/audit-log` package already provides schema validation, redaction, and JSONL file persistence, but the agent shell does not use it at runtime.

This change adds local development persistence for agent-shell workflow audit events. It stays separate from production audit storage and does not introduce native Windows capture, input, service, startup, or installer behavior.

## Goals / Non-Goals

**Goals:**

- Allow tests and CLI users to inject or configure an audit sink for agent-shell workflow events.
- Persist one schema-valid audit record for each host-generated development `audit-event`.
- Reuse the protocol `audit-event` event id, action, outcome, actor peer id, session id, and safe detail metadata.
- Apply existing audit redaction before JSONL persistence.
- Surface audit write failures rather than silently dropping local audit records.

**Non-Goals:**

- No production audit backend, encryption, tamper evidence, retention policy, or account-bound audit trail.
- No persistence of raw protocol payloads, raw relay tokens, raw pairing codes, display names, private reasons, screenshots, keystrokes, or screen contents.
- No screen capture, input injection, clipboard sync, file transfer, installer, service, startup, privilege, or hidden access behavior.

## Decisions

1. **Persist only host-generated workflow `audit-event` messages.**
   - Rationale: These are already curated to be secret-safe and represent consent lifecycle decisions. Persisting arbitrary received messages would risk storing untrusted payloads.
   - Alternative considered: Persist all protocol messages. That is broader than needed and would increase payload leakage risk.

2. **Use `@winbridge/audit-log` from the agent shell runtime.**
   - Rationale: The package centralizes schema validation and redaction, keeping relay and shell persistence semantics aligned.
   - Alternative considered: Write JSON directly in the agent shell. That would duplicate redaction and validation logic.

3. **Write the audit record before sending the protocol `audit-event`.**
   - Rationale: If the local audit sink fails, the runtime surfaces the failure and does not emit an unaudited workflow event in development mode.
   - Alternative considered: Send first and best-effort write later. That would hide local audit persistence failures.

4. **Support both dependency injection and CLI/env file path configuration.**
   - Rationale: Tests can inject memory sinks, while CLI users can configure JSONL files with `--audit-log` or `WINBRIDGE_AGENT_AUDIT_LOG_PATH`.
   - Alternative considered: Env only. That makes tests and explicit local runs less direct.

## Risks / Trade-offs

- **Risk: Audit sink failure interrupts development workflow.** -> Mitigation: This is intentional fail-closed development behavior; users can omit the sink when not testing persistence.
- **Risk: Private reason text leaks through audit files.** -> Mitigation: Persisted details remain the existing safe metadata booleans/counts and tests assert raw private reasons are absent.
- **Risk: Received peer audit events are not persisted.** -> Mitigation: This change is scoped to local host workflow events; peer/server audit collection is future work.
