## Context

The relay already emits `relay.peer.join.denied` for valid protocol messages that fail room admission, such as missing host pairing ticket, mismatched pairing code, duplicate peer id, or same-role conflict. The accepted-join audit path now projects bounded `deviceIdentity` metadata, but denied joins still lack device attribution.

Denied joins are higher risk for logging because the peer is not admitted and the attempted `deviceId` can be attacker-controlled. The relay must only use data that passed protocol validation and must avoid logging a `deviceId` that embeds the submitted pairing code.

## Goals / Non-Goals

**Goals:**

- Add bounded device identity attribution to denied join audit records for schema-valid `join-session` messages.
- Preserve existing denied join behavior, close reasons, pairing mutation rules, and room registration semantics.
- Redact attempted `deviceId` when it contains the submitted pairing code.
- Keep display names, raw pairing codes, tokens, protocol payloads, permissions, authorization identifiers, and remote-content data out of denied join audit records.

**Non-Goals:**

- No production trust scoring, device attestation, account authentication, MFA, or allow/deny policy based on device identity.
- No changes to host consent, session authorization, capture, input, clipboard, file transfer, diagnostics, reconnect, or native Windows APIs.
- No logging of raw device display names.

## Decisions

- Extend join denial attribution only after `decodeProtocolEnvelope` returns a schema-valid `ProtocolEnvelope`. This avoids using malformed raw JSON.
- Reuse the accepted-join projection shape for safe denied metadata: `deviceId`, `platform`, `trustLevel`, and `createdAt`.
- For denied joins, guard `deviceId` with the same pairing-code containment rule used for session and peer identifiers. If unsafe, omit raw `deviceId` and include bounded redaction metadata instead.
- Store denied identity metadata under `attemptedDeviceIdentity` to distinguish it from successfully registered device identity metadata.

## Risks / Trade-offs

- Device identity is self-reported in development and not a trust proof -> Mitigation: keep it audit-only and do not branch authorization or consent on it.
- Redaction can reduce attribution when a device id embeds a pairing code -> Mitigation: preserve platform, trust level, timestamp, and bounded id length metadata without raw secret content.
- More audit fields increase review burden -> Mitigation: add focused integration tests for mismatch and redacted-device-id paths.
