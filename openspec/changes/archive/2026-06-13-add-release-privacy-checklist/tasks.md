## 1. OpenSpec Preparation

- [x] 1.1 Validate the proposed OpenSpec change artifacts with strict validation before implementation.

## 2. Documentation

- [x] 2.1 Add a release readiness checklist covering consent, visibility, revoke/disconnect, auth/authorization, audit, data handling, installer/startup/service boundaries, security review, and verification.
- [x] 2.2 Add a bootstrap privacy notice covering current data handling, non-capabilities, local development logs, and non-production scope.
- [x] 2.3 Link the release checklist and privacy notice from README, GitHub setup, and the pull request template.
- [x] 2.4 Stabilize the local test runner to use a process-based Vitest pool for serial test-file invocations.

## 3. Verification

- [x] 3.1 Run focused documentation/spec checks for required release and privacy coverage.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Perform a safety review confirming this is documentation/process-only and adds no capture, input, clipboard, file-transfer, auth, relay, installer, startup, service, token, logging, or privilege behavior.
