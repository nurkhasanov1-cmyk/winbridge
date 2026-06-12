## 1. Token Validation

- [x] 1.1 Reject untrimmed relay shared-token configuration in env parsing and injected runtime options.
- [x] 1.2 Reject untrimmed agent shell `--token` values during CLI argument parsing.
- [x] 1.3 Reject untrimmed direct agent runtime token options before relay connection setup.

## 2. Tests

- [x] 2.1 Update relay integration tests for trimmed-token acceptance and untrimmed-token rejection.
- [x] 2.2 Update agent shell argument and runtime tests for untrimmed-token rejection and secret-safe diagnostics.

## 3. Specs, Docs, Verification, and Review

- [x] 3.1 Sync main OpenSpec specs and docs with canonical shared-token requirements.
- [x] 3.2 Run focused relay and agent token tests.
- [x] 3.3 Run `npm run verify`.
- [x] 3.4 Perform a security review of token validation, relay admission, diagnostics, logging, audit records, and OpenSpec impact.
