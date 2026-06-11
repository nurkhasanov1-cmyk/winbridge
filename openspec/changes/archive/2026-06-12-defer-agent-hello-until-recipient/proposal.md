# Defer Agent Shell Hello Until Recipient

## Why

The agent shell currently sends `hello` immediately after `join-session`. The relay now requires a concrete remaining recipient for peer-originated messages, so a host-only startup can produce a bounded `relay-error` for an early `hello` that previously had no recipient and no useful effect.

Deferring `hello` until a paired peer is present keeps startup quiet, preserves the two-party consent workflow, and avoids treating pairing as authorization.

## What Changes

- Send `join-session` when the socket opens, but do not send `hello` until a recipient is available.
- Send local `hello` exactly once when the relay reports a two-peer room or when a peer `hello` is received.
- Keep viewer authorization requests behind explicit requested permissions and send them only after the paired-room signal.
- Document the behavior so future clients do not rely on recipient-less protocol messages.

## Safety Impact

This change touches the non-native development agent shell workflow and relay-adjacent message ordering. It does not add screen capture, input injection, clipboard sync, file transfer, installer behavior, startup persistence, services, tokens, logs, privilege elevation, or native Windows API usage.

Safety invariants remain unchanged:

- Pairing and `hello` do not grant permissions.
- Host approval remains explicit.
- Visible active state is still required before any future sensitive action.
- Revocation and disconnect paths remain fail-closed.
- Local runtime events continue to use redacted protocol views.

## Non-Goals

- No production identity, device trust, or reconnect design.
- No native host UI, capture, input, clipboard, or file-transfer implementation.
- No relay authorization model change beyond consuming existing `relay-ready` room metadata in the agent shell.

## Modified Capability

- `agent-shell-consent-workflow`

