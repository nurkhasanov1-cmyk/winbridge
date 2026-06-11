## Context

The development relay is currently implemented directly in `apps/relay/src/index.ts`. Importing the module creates an HTTP server and WebSocket server immediately. That is acceptable for manual development but weak for integration tests and future embedding.

## Goals / Non-Goals

**Goals:**

- Expose a `createRelayRuntime` factory.
- Provide explicit async `start()` and `stop()` lifecycle.
- Support ephemeral ports for tests.
- Preserve current CLI behavior.
- Cover actual WebSocket behavior with integration tests.

**Non-Goals:**

- No production deployment manager.
- No TLS or hosted relay infrastructure.
- No account auth.
- No capture, input, clipboard, file transfer, installer, service, startup, or privilege behavior.

## Decisions

1. **Move server construction into `server.ts`.**
   - Rationale: Tests and CLI can share one implementation.
   - Alternative considered: Spawn the CLI in tests. That is slower and harder to inspect.

2. **Inject audit sink and rate limiters.**
   - Rationale: Tests can assert behavior without scraping console output or relying on global state.
   - Alternative considered: Keep module-level singletons. That makes tests order-dependent.

3. **Keep CLI thin.**
   - Rationale: Runtime behavior should live in one testable path.
   - Alternative considered: Separate CLI and test server paths. That risks drift.

## Risks / Trade-offs

- **Risk: Refactor changes manual relay behavior.** -> Mitigation: Preserve env names, logging, and default port; add integration tests.
- **Risk: Tests become flaky around WebSocket timing.** -> Mitigation: Use deterministic local runtime and small wait helpers.
- **Risk: Audit test output becomes noisy.** -> Mitigation: Inject memory sinks in tests.

## Migration Plan

1. Add relay runtime factory.
2. Replace CLI entrypoint with runtime wrapper.
3. Add WebSocket integration tests.
4. Run verification, archive, commit, and push.
