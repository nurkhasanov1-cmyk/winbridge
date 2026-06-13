## Why

The agent shell can simulate pause and resume through configured timers, but future host UI code needs immediate host controls that use the same consent, visibility, audit, and fail-closed gates. Adding direct pause/resume controls moves the development runtime closer to the required host-visible session controls without adding native capture or input.

## What Changes

- Add managed agent-shell `pause()` and `resume()` controls for host runtimes.
- Require direct pause to run only after active visible host authorization.
- Require direct resume to run only after paused visible host authorization.
- Reuse the same protocol, indicator, audit, and secret-safe logging behavior as delayed pause/resume simulation.
- Keep audit persistence fail-closed for pause/resume: if the matching audit write fails, no pause/resume protocol messages are sent.
- Keep delayed workflow timers coherent after direct pause/resume by sharing host workflow state.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-shell-consent-workflow`: Adds direct local host pause/resume control behavior and audit/failure requirements.

## Impact

- Affected code: `apps/agent-shell/src/runtime.ts`, `apps/agent-shell/src/runtime.integration.test.ts`.
- Affected docs/specs: `openspec/specs/agent-shell-consent-workflow/spec.md`, `docs/architecture.md`, `docs/security-model.md`.
- Affected surfaces: authorization lifecycle, visible host indicator, host session controls, local audit/logging.
- Not affected: screen capture, input injection, clipboard, file transfer, diagnostics collection, installer behavior, startup persistence, background services, native Windows APIs, relay routing, tokens, or privilege elevation.
