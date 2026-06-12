## Why

Audit records and protocol `audit-event` messages are ultimately emitted as JSON lines or JSON protocol envelopes, but their detail payloads currently accept arbitrary JavaScript values. Non-JSON values such as functions, symbols, bigint, `undefined`, `NaN`, or `Infinity` can be silently dropped, coerced unexpectedly, or throw at persistence time, weakening audit reliability.

## What Changes

- Require audit detail values to be JSON-compatible before records are stored, emitted, encoded, or persisted.
- Reject non-JSON audit detail values at shared audit record creation and protocol `audit-event` parsing/encoding.
- Preserve existing recursive redaction behavior for sensitive detail keys after the accepted detail shape is validated.
- Add tests for accepted JSON detail values and rejected non-JSON detail values across protocol and development audit sinks.
- Non-goals: no capture, input, native Windows API, installer, startup, service, token format, privilege elevation, hidden session, persistence, or relay transport changes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `audit-foundation`: Audit record and protocol `audit-event` detail metadata must be JSON-compatible and reject non-JSON values.
- `audit-log-persistence`: Development JSONL audit sinks must reject non-JSON detail metadata before writing partial or invalid audit output.

## Impact

- Affected code: `packages/protocol/src/audit.ts`, `packages/protocol/src/messages.ts`, `packages/audit-log/src/index.test.ts`, and related protocol tests/docs.
- Affected APIs: audit detail inputs that previously supplied non-JSON JavaScript values will now fail validation.
- Affected systems: local development audit sinks and protocol `audit-event` schema validation.
- Safety impact: improves audit integrity for security-relevant events without adding remote access capability. Touches logs; requires security review.
