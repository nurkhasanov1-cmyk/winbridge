## Context

The development relay already validates protocol envelopes through `@winbridge/protocol` and forwards schema-valid messages with `encodeProtocolEnvelope`. Rejected peer messages use a relay-owned non-protocol response shaped as `{ type: "relay-error", reason }`.

That response is currently serialized with direct `JSON.stringify` in the relay runtime. Direct serialization is safe for normal objects, but it can be affected by same-process prototype pollution such as an inherited `Object.prototype.toJSON` hook. Relay rejection responses are a security-relevant network boundary, so they should use the same canonical JSON encoder that protocol and audit serialization now use.

## Goals / Non-Goals

**Goals:**

- Encode relay-owned `relay-error` responses with the shared canonical JSON serializer.
- Preserve the existing peer-facing response shape and bounded rejection reasons.
- Add integration coverage proving inherited `toJSON` hooks cannot inject fields into relay-error responses.
- Preserve malformed-message audit redaction, rate limiting, and disconnect behavior.

**Non-Goals:**

- No change to protocol envelope schemas or relay forwarding behavior.
- No new transport, reconnect, NAT traversal, capture, input, clipboard, file transfer, diagnostics, token, installer, service, startup, or privilege elevation behavior.
- No conversion of `relay-error` into a protocol envelope; it remains a relay-owned non-protocol response for malformed relay input.

## Decisions

### Use the shared canonical JSON encoder for relay-error responses

The relay runtime will import `stringifyJson` from `@winbridge/protocol` and use it for the relay-owned error response.

Rationale: the shared encoder already snapshots values with descriptor-based traversal and excludes inherited `toJSON` hooks. Reusing it avoids a second security-sensitive serializer and keeps relay, protocol, and audit boundaries aligned.

Alternative considered: manually concatenate the small JSON response string. That would avoid `JSON.stringify`, but it would duplicate escaping behavior and invite mistakes if the response shape changes.

### Keep protocol forwarding on `encodeProtocolEnvelope`

Schema-valid protocol messages will continue to be forwarded with `encodeProtocolEnvelope`.

Rationale: protocol envelopes already have schema validation and encoding behavior, and this change only covers the non-protocol relay-error path.

Alternative considered: route relay-error through protocol envelope encoding. That would change the wire contract for malformed inputs and is outside the scope of this hardening change.

### Test with a temporary inherited toJSON hook

Integration coverage will temporarily define `Object.prototype.toJSON`, send malformed input from a registered peer, and assert the peer receives only the bounded relay-error object. The test will restore the original descriptor in a `finally` block before assertions that rely on serialization.

Rationale: this exercises the exact runtime risk without adding production test hooks.

Alternative considered: unit-test the encoder only. Existing protocol tests cover the encoder; the relay needs an integration test to prove the correct encoder is used on the network boundary.

## Risks / Trade-offs

- Prototype mutation in tests could leak into later tests -> restore the original descriptor in `finally` and keep the test focused.
- The shared encoder may throw if future relay-error fields become non-JSON -> this is desirable for a network response and should be caught during tests.
- This touches relay behavior -> require a focused security review before archiving.

## Migration Plan

No data migration is required. Existing clients continue to receive `{ "type": "relay-error", "reason": "<bounded reason>" }`. Rollback is the single-line encoder change if unexpected compatibility issues appear.

## Open Questions

None.
