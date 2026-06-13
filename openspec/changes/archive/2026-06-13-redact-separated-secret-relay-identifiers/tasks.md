## 1. OpenSpec

- [x] 1.1 Add relay-runtime delta requirements for separator-form secret-bearing relay audit identifiers.
- [x] 1.2 Validate the active OpenSpec change strictly before implementation proceeds.

## 2. Implementation

- [x] 2.1 Update relay audit attribution to classify protocol identifiers with the protocol-identifier secret-marker detector.
- [x] 2.2 Update relay runtime join and forwarding audit identifier checks to use the protocol-identifier detector while preserving pairing-code containment redaction.

## 3. Verification

- [x] 3.1 Add focused tests for separator-form session ids and relay actor peer ids.
- [x] 3.2 Add focused integration coverage for separator-form join session ids, peer ids, device ids, and forwarded recipient peer ids.
- [x] 3.3 Run focused relay tests.
- [x] 3.4 Run security review for relay audit redaction and OpenSpec impact.
- [x] 3.5 Run `npm run check`, `npm test`, `npm run build`, and `npm run openspec:validate`.
- [x] 3.6 Archive the completed OpenSpec change after verification.
