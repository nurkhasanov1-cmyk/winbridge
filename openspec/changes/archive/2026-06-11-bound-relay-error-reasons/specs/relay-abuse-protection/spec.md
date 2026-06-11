## ADDED Requirements

### Requirement: Secret-safe relay rejection reasons
The relay SHALL normalize peer-facing relay errors and invalid-message audit reasons to bounded secret-safe strings.

#### Scenario: Malformed message reason is generic
- **WHEN** a peer sends malformed JSON or schema-invalid protocol input
- **THEN** the relay returns a bounded generic rejection reason and MUST NOT include raw parser details or raw message contents

#### Scenario: Known policy rejection reason is preserved
- **WHEN** the relay rejects a message for a known safe policy reason such as session mismatch, forged disconnect notice, unsafe signal payload, or oversized message
- **THEN** the relay may return that bounded policy reason without raw payload contents

#### Scenario: Invalid-message audit reason is secret-safe
- **WHEN** the relay audits a malformed or rejected protocol message
- **THEN** the audit reason MUST NOT include raw protocol payloads, raw tokens, raw pairing codes, credentials, keystrokes, screenshots, screen contents, parser internals, or full secrets
