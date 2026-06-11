## Context

`parseArgs` already constrains the CLI option `--host-decision` to `none`, `approve`, or `deny`. The managed runtime accepts the same option as a TypeScript union, but runtime callers can still pass malformed values from JavaScript, casts, or integration boundaries. The current host authorization handler only special-cases `none` and `deny`; every other value reaches the approval path.

## Goals / Non-Goals

**Goals:**

- Validate `AgentShellRuntimeOptions.hostDecision` at the runtime boundary.
- Fail before opening a relay WebSocket or sending authorization decisions when the value is malformed.
- Keep malformed configuration failures bounded and deterministic.
- Preserve `undefined` as the same safe default as `none`.

**Non-Goals:**

- No changes to production remote assistance capabilities.
- No changes to protocol schemas, relay routing, authentication tokens, or audit payload content.
- No new capture, input, service, startup, installer, or privilege behavior.

## Decisions

- Add a runtime guard in `createAgentShellRuntime` before URL parsing and socket creation. This makes invalid consent configuration fail during construction, before any network side effect.
- Add a defensive exhaustive branch in the host authorization handler so future internal changes cannot accidentally route unknown decisions to approval.
- Keep CLI parsing separate from runtime validation. The CLI remains responsible for usage errors, while the runtime is responsible for enforcing its own safety boundary when called directly.
- Use a focused runtime test that constructs the runtime with an invalid host decision and asserts that construction fails before any relay is started.

Alternative considered: rely on TypeScript type checking and CLI parsing only. This was rejected because runtime safety cannot depend on callers being TypeScript-only or avoiding casts.

## Risks / Trade-offs

- [Risk] Existing direct callers that pass malformed values will now fail earlier. -> Mitigation: valid values and `undefined` behavior are unchanged, and the failure protects the host consent gate.
- [Risk] Duplicate validation can drift between CLI and runtime. -> Mitigation: keep the runtime guard small, explicit, and covered by tests.
