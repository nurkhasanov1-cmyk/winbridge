# Gate Viewer Authorization Request On Paired Room

## Why

Viewer authorization requests should only be sent when a relay recipient is known to be present. The current relay normally gives viewers `relay-ready.roomSize = 2`, but the agent shell still sends the request for any viewer `relay-ready` message. Making the paired-room gate explicit keeps the runtime fail-closed if relay behavior changes or a test server sends a one-peer ready event.

## What Changes

- Send viewer `session-authorization-request` only when `relay-ready.roomSize >= 2`.
- Preserve the existing explicit requested-permission gate.
- Add focused coverage for a viewer receiving `relay-ready.roomSize = 1`.
- Update specs/docs to state that viewer authorization requests depend on a paired relay room.

## Safety Impact

This change touches the non-native development agent shell consent workflow and relay-adjacent message ordering. It does not add capture, input, clipboard, file transfer, installer behavior, startup persistence, services, tokens, logs, privilege elevation, or native Windows APIs.

The change is fail-closed: a viewer that is not paired does not send authorization workflow messages.

## Non-Goals

- No production identity, authorization, reconnect, or device trust changes.
- No native Windows host UI, screen capture, input, clipboard, or file-transfer work.
- No relay forwarding rule changes.

## Modified Capability

- `agent-shell-consent-workflow`

