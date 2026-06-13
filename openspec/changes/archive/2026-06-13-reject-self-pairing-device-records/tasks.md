## 1. OpenSpec

- [x] 1.1 Create proposal, design, delta spec, and tasks for distinct host/viewer paired-device records.
- [x] 1.2 Validate the active OpenSpec change in strict mode.
- [x] 1.3 Extend relay-runtime OpenSpec coverage for self-pairing denied-join audit redaction.

## 2. Implementation

- [x] 2.1 Add identity-layer validation that rejects self-pairing before returning a paired-device record.
- [x] 2.2 Add focused protocol identity tests for self-pairing rejection and valid distinct-device pairing.
- [x] 2.3 Update architecture and security documentation for distinct host/viewer pairing metadata.
- [x] 2.4 Redact self-pairing denied-join attempted device ids and add relay audit coverage.

## 3. Verification

- [x] 3.1 Run focused protocol identity tests.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.3 Complete a safety review for the identity/pairing diff.

## 4. Completion

- [x] 4.1 Archive the OpenSpec change after implementation and verification.
- [x] 4.2 Commit and push the completed increment to GitHub.
