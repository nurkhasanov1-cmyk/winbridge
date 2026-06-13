## Context

The shared audit layer redacts common sensitive audit detail fields and detects secret-bearing reason/action text. It already covers passwords, tokens, credentials, API keys, access keys, cookies, private keys, SSH keys, and remote-assistance content markers, but passphrases are not explicitly covered.

This change tightens audit redaction in the shared protocol package. It does not introduce a new audit sink, collect new data, or change relay/session authorization behavior.

## Goals / Non-Goals

**Goals:**

- Redact passphrase-bearing audit detail keys recursively.
- Redact top-level audit reasons that contain passphrase-bearing assignments or markers with values.
- Reject audit record actions and protocol `audit-event.action` values that contain passphrase-bearing secret metadata.
- Redact audit detail `authorizationId` values that contain passphrase-bearing metadata.
- Cover both shared audit record creation and protocol `audit-event` parse/encode paths.

**Non-Goals:**

- No new logging sink, persistence format, audit event type, telemetry, account identity, token storage, relay routing, authentication, capture, input, clipboard, file-transfer, diagnostics, installer, startup, service, or privilege behavior.
- No change to bounded safe reason codes or non-secret lifecycle identifiers.

## Decisions

- Add `passphrase` to the existing normalized audit sensitive-key and protocol-identifier marker lists.
  - Rationale: the audit layer already normalizes key names by removing separators and lowercasing, so one marker covers `passphrase`, `passPhrase`, `pass-phrase`, and `raw_passphrase`.
  - Alternative considered: add special-case checks in each redaction call site. Rejected because the existing marker lists centralize secret classification.

- Extend the existing reason marker regular expression to include `passphrase`.
  - Rationale: top-level audit reasons are free text and need explicit marker detection when a secret-like key is followed by a value.
  - Alternative considered: rely only on key-assignment extraction. Rejected because the reason marker expression already covers common free-text forms and should remain consistent with detail redaction.

## Risks / Trade-offs

- [Risk] A benign operational field with `passphrase` in its name will be redacted. -> Mitigation: audit logs are security records, and credential-like field names should be treated conservatively.
- [Risk] Marker lists can drift between signal payload and audit redaction. -> Mitigation: this change aligns audit markers with the existing signal passphrase hardening and adds explicit tests.
