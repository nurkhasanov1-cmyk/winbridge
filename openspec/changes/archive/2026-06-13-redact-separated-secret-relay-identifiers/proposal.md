## Why

Relay audit output already redacts protocol identifiers that visibly include secret-bearing metadata. The current relay runtime uses the generic audit-metadata detector for session ids, peer ids, device ids, and recipient peer ids, while protocol identifiers allow punctuation separators such as `.`, `_`, `-`, and `:`. That can leave separator-only forms like `token-raw-session-secret` or `cookie.raw-peer-secret` inspectable in audit output even though they carry obvious secret-marker semantics.

## What Changes

- Use the protocol-identifier secret-marker detector for relay audit identifiers.
- Redact separator-form secret-bearing identifiers from top-level relay audit `sessionId`, relay actor ids, join device identity metadata, and forwarded recipient peer metadata.
- Add focused relay audit and WebSocket integration coverage for `.`, `_`, `-`, and `:` separated secret-marker identifiers.
- Keep identifier redaction audit-only; peer registration, room lookup, pairing ticket lifecycle, forwarding, consent, authorization, capture, input, reconnect, and disconnect behavior remain unchanged.
- No breaking changes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `relay-runtime`: strengthens secret-bearing relay audit identifier redaction for schema-valid identifiers that contain secret markers separated by allowed identifier punctuation.

## Impact

- Affected code: `apps/relay/src/audit.ts`, `apps/relay/src/server.ts`, relay tests.
- Affected specs: `openspec/specs/relay-runtime/spec.md`.
- Safety impact: reduces accidental leakage of token-, credential-, cookie-, key-, or authorization-header-like identifiers in relay audit output. This does not add capture, remote input, clipboard, file transfer, installer behavior, startup persistence, services, privilege elevation, Windows native APIs, hidden sessions, credential access, or security prompt bypass.
