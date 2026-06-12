## 1. Permission Parsing

- [x] 1.1 Change CLI permission parsing to reject whitespace-padded `--request` entries instead of trimming them.
- [x] 1.2 Preserve valid exact comma-separated permissions, omitted `--request`, duplicate detection, and invalid permission rejection.

## 2. Tests And Docs

- [x] 2.1 Add focused CLI argument tests for whitespace-padded requested permission rejection and exact valid lists.
- [x] 2.2 Update user-facing docs for canonical comma-separated `--request` permission syntax.
- [x] 2.3 Run focused agent-shell argument tests.

## 3. Verification

- [x] 3.1 Run strict OpenSpec validation for `require-exact-cli-request-permissions`.
- [x] 3.2 Run `npm run verify`.
- [x] 3.3 Perform security review for authorization/permission parsing changes.
- [x] 3.4 Archive the completed OpenSpec change.
