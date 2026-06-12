## Context

The protocol currently rejects empty, oversized, and obviously sensitive `signal` payload keys for tokens, auth/session secrets, keylogging, and screen data. WinBridge also treats clipboard access, file transfer, and diagnostics as sensitive actions, but obvious content-bearing key names for those categories are not named in the `signal` boundary yet.

The development relay parses protocol envelopes before forwarding, so tightening `SignalMessageSchema` protects both direct protocol use and relay forwarding.

## Goals / Non-Goals

**Goals:**

- Reject `signal` payload keys that clearly indicate clipboard contents, file-transfer contents/data/bytes, or diagnostic contents/dumps at any nesting level.
- Preserve existing safe signaling metadata and lifecycle identifiers such as `authorizationId`.
- Verify the relay still rejects the message before forwarding and keeps rejection audit metadata secret-safe.

**Non-Goals:**

- No clipboard sync, file transfer, diagnostics export, screen capture, input injection, media transport, native Windows service, installer, startup, or privilege elevation behavior.
- No value/content scanning beyond key-name indicators.
- No production identity or transport-encryption redesign.

## Decisions

1. Extend key-name indicators in the protocol schema.
   - Rationale: all relay and agent paths already depend on `parseProtocolEnvelope`/`encodeProtocolEnvelope`, so one schema rule enforces the boundary consistently.
   - Alternative considered: add relay-only filtering. That would leave direct protocol consumers and tests weaker.

2. Use specific file-transfer indicators instead of a broad `file` substring.
   - Rationale: `filecontent`, `filedata`, `filebytes`, and `filetransfer` catch obvious content transport attempts while avoiding false positives such as `profile`.
   - Alternative considered: reject any key containing `file`. That would block too many benign signaling names.

3. Keep the rule based on key names rather than inspecting values.
   - Rationale: values can be arbitrary JSON and content inspection is brittle; the purpose here is to block obvious misuse of signaling as a content channel.
   - Alternative considered: scan values for high-entropy or structured data. That would add false positives without replacing permissioned data-plane controls.

## Risks / Trade-offs

- Overblocking legitimate future metadata names that include `clipboard`, `filetransfer`, or `diagnostic` -> Future features must introduce explicit permissioned message types and can refine safe identifiers through OpenSpec.
- Key-name filtering cannot prove no sensitive value exists under a benign key -> This remains a defense-in-depth schema boundary, not a substitute for capability-specific authorization, audit, and permissioned transports.
- Relay rejection reasons mention schema class only -> This is intentional so audit and peer-facing errors do not leak raw payload keys or values.

## Migration Plan

This is a schema-tightening change for the development protocol. Existing valid signaling metadata keeps working. Any client currently attempting to use `signal` for clipboard, file-transfer, or diagnostics content will fail closed and must move to a future explicit, consent-bound capability.

Rollback is a single revert of the schema/test/docs change if the indicators prove too broad during development.

## Open Questions

None.
