## Context

Relay audit identifiers are schema-valid protocol identifiers used for operational correlation: top-level audit `sessionId`, relay actor ids derived from peer ids, join device identity `deviceId`, and forwarded recipient peer metadata. The main `relay-runtime` spec already requires secret-bearing relay audit identifiers to be redacted, while preserving runtime room and forwarding behavior.

The protocol package now exposes `hasSecretBearingProtocolIdentifierMetadata`, which normalizes non-alphanumeric separators before checking token, credential, cookie, API key, access key, private key, SSH key, authorization header, and auth-header marker families. Relay audit code still uses `hasSecretBearingAuditMetadata`, which is better suited to human-readable audit reasons and key assignment text.

## Decision

Relay audit identifier safety checks will use `hasSecretBearingProtocolIdentifierMetadata` wherever the value being classified is a schema-valid protocol identifier:

- relay audit sink attribution in `apps/relay/src/audit.ts`;
- accepted and denied join attribution in `apps/relay/src/server.ts`;
- join `deviceIdentity.deviceId` audit metadata;
- accepted forwarded recipient peer audit metadata.

The existing pairing-code containment check for join-derived identifiers remains in place. It protects against accidental disclosure when a host or viewer embeds the submitted pairing code into an otherwise safe-looking identifier.

## Safety Invariants

- Redaction remains audit-only.
- Registration, room lookup, pairing ticket creation or consumption, message routing, and disconnect behavior continue to use the validated raw identifiers.
- Redacted audit output may include only bounded metadata such as `*Redacted: true` and original identifier length.
- Raw secret-bearing identifiers, marker substrings, pairing codes, and secret suffixes must not appear in relay audit records.

## Verification

- Add relay audit unit coverage for separator-form session and peer ids in `writeRelayAudit`.
- Extend relay integration tests for accepted join attribution, accepted and denied device identity metadata, and forwarded recipient peer metadata.
- Run focused relay tests, strict OpenSpec validation, and the standard repository verification commands.
