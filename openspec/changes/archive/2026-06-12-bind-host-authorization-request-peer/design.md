## Context

`apps/agent-shell` is a non-native protocol exerciser. It does not capture screens, inject input, sync clipboard, transfer files, or run as a background service. It still emits consent workflow decisions, authorization states, and audit events, so inbound request handling must remain fail-closed.

The development relay enforces registered peer roles and only forwards viewer-originated authorization requests from the registered viewer. The managed runtime should also avoid treating arbitrary same-session request messages as host workflow input before it has local evidence of the viewer peer.

## Goals / Non-Goals

**Goals:**

- Record the remote peer id and role from accepted inbound opposite-role `hello` messages.
- Ignore host-side `session-authorization-request` messages unless `viewerPeerId` matches the observed remote peer id and the observed remote role is `viewer`.
- Run the guard before local `received` events, host workflow decisions, authorization states, and audit events.
- Keep ignored diagnostics limited to redacted byte-length style metadata.
- Preserve normal paired relay flow and existing host request handling after peer binding.

**Non-Goals:**

- Do not require public-key identity or production authentication in this bootstrap shell.
- Do not alter relay room, pairing, or forwarding rules.
- Do not alter protocol schemas.
- Do not add capture, input, clipboard, file transfer, WebRTC, native Windows UI, services, startup persistence, credential access, stealth behavior, or production identity.

## Decisions

1. **Bind host request workflow to accepted peer presence.**
   - The accepted `hello` path already excludes cross-session, self, same-role, and malformed messages.
   - Using that path gives the host a local peer id before it emits consent workflow output.

2. **Fail closed when the observed peer is missing or mismatched.**
   - A missing `hello` means the runtime has not established a remote viewer identity.
   - A mismatched `viewerPeerId` could cause decisions and audit events for a different identity; ignoring before workflow is safer.

3. **Keep relay behavior unchanged.**
   - The relay remains the transport authority for registered peers.
   - This change is a local defense-in-depth boundary for managed runtime consumers and tests.

## Risks / Trade-offs

- [Risk] Custom test servers that send authorization requests without sending viewer `hello` first will no longer trigger host workflow output.
  Mitigation: legitimate managed lifecycle already sends `hello` before viewer authorization requests; tests can send an accepted viewer `hello` first.
- [Risk] Future multi-viewer support would need a richer peer registry.
  Mitigation: current product model is a two-party host-viewer assistance session; multi-viewer support would require a separate OpenSpec change.
