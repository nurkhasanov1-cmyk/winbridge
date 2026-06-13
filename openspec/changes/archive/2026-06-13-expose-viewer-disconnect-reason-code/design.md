## Context

The agent shell already treats relay-originated `peer-disconnected` messages as trusted only after they match the observed remote peer. Viewer status then reports inactive local state and clears action-capable permissions, but the status snapshot discards the bounded `reasonCode` that was already schema-validated by `packages/protocol`.

The current status API and CLI output are intentionally metadata-only development surfaces. This change extends that metadata with a bounded enum value while preserving the read-only behavior.

## Goals / Non-Goals

**Goals:**

- Persist the last trusted remote host disconnect reason code in the viewer runtime's local session state.
- Include that code in `getViewerStatus()` only after trusted remote host disconnect.
- Include that code in viewer status CLI formatting when present.
- Document and test that status reads remain local and secret-safe.

**Non-Goals:**

- No reconnect, retry, peer replacement, or session restoration behavior.
- No changes to relay routing, pairing, protocol reason-code vocabulary, authentication, authorization, capture, input, installer, services, startup, tokens, logs, or privilege elevation.
- No exposure of raw WebSocket close reason text, peer ids, display names, tokens, pairing codes, signal payloads, screen data, input data, or private reason strings.

## Decisions

- Store only the protocol `reasonCode`, not free-form close metadata.
  - Rationale: `peer-disconnected.reasonCode` is already bounded by the protocol enum and can distinguish ordinary close from heartbeat timeout.
  - Alternative considered: expose host WebSocket close reason text. Rejected because it can contain operator-provided private text and is explicitly local metadata.
- Add the field as optional viewer status metadata.
  - Rationale: inactive, pre-authorization, denied, terminal, and local viewer leave states should keep their current minimal status shape.
  - Alternative considered: always include a placeholder. Rejected because it adds noise and may imply a disconnect occurred when it did not.
- Set the field only on trusted remote disconnect handling.
  - Rationale: existing runtime guards reject self, unbound, and mismatched disconnect notices before state mutation.
  - Alternative considered: derive from socket close events. Rejected because local close events do not prove a trusted remote host disconnect.

## Risks / Trade-offs

- Bounded reason code could be mistaken for reconnect permission -> Mitigation: spec and docs state it is metadata only and MUST NOT reconnect, authorize, grant permissions, start signaling, or invoke host controls.
- Future protocol reason codes may become more specific -> Mitigation: Type the status field from the protocol envelope so new bounded enum values flow through intentionally with protocol tests.
