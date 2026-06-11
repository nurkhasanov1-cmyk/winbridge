## Context

The agent shell is a non-native development exerciser for the consent/session protocol. It receives WebSocket messages from the relay, emits local runtime events for tests and callers, and writes logs through the configured logger.

Inbound messages that fail protocol decoding are currently logged as summaries, but the local `raw` event still carries the original text. Local events are not production audit storage, yet tests, debug harnesses, or future UI adapters can persist or render them. That makes the event surface part of the project's secret-handling boundary.

## Goals / Non-Goals

**Goals:**

- Prevent local `raw` runtime events from exposing raw non-protocol inbound text.
- Preserve the ability to observe that non-protocol traffic arrived.
- Keep malformed-message logging summary-only.
- Cover the behavior with focused integration tests and docs.

**Non-Goals:**

- No changes to relay forwarding, protocol schemas, pairing, authorization, capture, input, clipboard, file transfer, installer, services, startup, privilege elevation, or reconnect behavior.
- No production diagnostics pipeline or durable event store.
- No attempt to parse or classify malformed payload contents after decode failure.

## Decisions

1. Emit metadata-only `raw` events.

   The event will retain `direction: "raw"` and expose `text: "[REDACTED]"` plus `byteLength`. This keeps existing event consumers able to detect raw inbound traffic while removing the secret-bearing payload.

   Alternative considered: remove the `text` field entirely. That is cleaner, but creates a larger local API break for tests and consumers. A redacted placeholder is safer for this incremental hardening change.

2. Compute byte length once at the decode-failure boundary.

   The same byte length will be used for the event and the summary log. This avoids duplicate calculations and keeps diagnostics useful without retaining content.

   Alternative considered: include a hash of the raw text. Rejected because hashes can still aid correlation of sensitive payloads and are unnecessary for the current test/debug use case.

3. Do not emit raw parser errors through `raw` events.

   The decode-failure path will continue to avoid parser exception details in local raw events and logs. Parser errors can include schema paths or rejected values; preserving them would weaken the redaction boundary.

## Risks / Trade-offs

- Local consumers expecting raw payload content will lose that data -> this is intentional for the consent-first safety boundary; tests should assert redaction instead.
- Byte length can still reveal approximate payload size -> acceptable diagnostic metadata because it does not expose tokens, credentials, pairing material, keystrokes, screenshots, or screen contents.
- Future event variants could reintroduce raw payloads -> main spec and docs will name local event surfaces explicitly, and security review remains required for log/event changes.
