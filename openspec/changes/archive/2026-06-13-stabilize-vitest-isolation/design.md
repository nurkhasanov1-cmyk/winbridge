## Context

`scripts/run-tests.mjs` discovers every `.test.ts` file under `apps/` and
`packages/`, then launches Vitest once per file with `--pool forks` and one
worker. This was added to avoid Windows worker-thread IPC failures in runtime
integration tests. The current command also passes `--no-isolate`.

On the local Windows environment, full `npm test` runs intermittently fail after
test assertions pass with Vitest/Tinypool `ERR_IPC_CHANNEL_CLOSED`. Focused runs
of the long integration files pass when the same process-pool command omits
`--no-isolate`, keeping Vitest's default forks isolation.

## Goals / Non-Goals

**Goals:**

- Keep `npm test` deterministic enough for the required local verification gate.
- Preserve serial per-file discovery and process-based Vitest workers.
- Avoid masking real assertion failures with blanket retries.

**Non-Goals:**

- No remote assistance behavior changes.
- No switch back to thread workers.
- No skipped tests, test filtering, or supported Node runtime changes.

## Decisions

- Remove `--no-isolate` from `scripts/run-tests.mjs`.
  - Rationale: each Vitest invocation already receives a single test file, so
    default isolation does not introduce file-level parallelism, while it avoids
    the observed process-worker teardown race.
  - Alternative considered: add a retry for `ERR_IPC_CHANNEL_CLOSED`. Rejected
    because retry logic can hide infrastructure failures and makes failed test
    output harder to reason about.
  - Alternative considered: use `poolOptions.forks.singleFork`. Rejected because
    the local relay integration run still reproduced the IPC failure with that
    option.

## Risks / Trade-offs

- [Risk] Default isolation may add a small startup cost inside each Vitest run.
  -> Mitigation: the runner already starts one Vitest process per file, and the
  reliability gain is more important than marginal overhead.
- [Risk] Future Vitest defaults could change. -> Mitigation: the OpenSpec
  contract continues to require process workers, one worker, and no file
  parallelism, so the core safety property remains explicit.
