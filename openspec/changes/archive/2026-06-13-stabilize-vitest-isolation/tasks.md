## 1. Runner Contract

- [x] 1.1 Update `scripts/run-tests.mjs` so each Vitest invocation keeps the forks pool, one worker, no file parallelism, and omits `--no-isolate`.
- [x] 1.2 Confirm the OpenSpec delta matches the implemented runner flags.

## 2. Review and Verification

- [x] 2.1 Review the change for skipped tests, retry masking, or any remote-assistance behavior impact.
- [x] 2.2 Run focused runtime integration tests for the long agent-shell and relay files with the updated isolation behavior.
- [x] 2.3 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
