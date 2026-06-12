## Why

Audit records must stay meaningful enough to support consent, authorization, incident review, and test assertions. Whitespace-only audit metadata can pass length checks while producing records with no usable action, target type, reason, or protocol audit-event action.

## What Changes

- Reject whitespace-only shared audit record `action`, optional `reason`, and target `type` values.
- Reject whitespace-only protocol `audit-event.action` values before parsing, forwarding, encoding, or persistence.
- Add focused protocol and audit tests for blank audit metadata rejection.
- Document the stricter audit metadata invariant.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `audit-foundation`: audit metadata validation becomes stricter so structured audit records and protocol audit-event messages cannot carry blank semantic fields.

## Impact

- Affected area: shared audit schema and protocol audit-event schema in `packages/protocol`.
- API surface: no new exports; existing parsers reject additional malformed audit metadata.
- Dependencies: none.
- Safety impact: improves audit integrity for consent and authorization workflows by preventing meaningless audit action/reason metadata.
- Non-goals: no capture, input, relay routing, installer, startup, service, token, credential, privilege elevation, stealth, persistence, keylogging, evasion, or Windows prompt behavior changes.
