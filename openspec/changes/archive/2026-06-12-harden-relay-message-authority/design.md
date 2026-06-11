## Context

The relay registers a WebSocket as a concrete `RelayPeer` after a valid `join-session` message. Later messages are schema-validated and session-bound, but the relay should also reject messages that claim a different actor or originate relay-only/join-only protocol types.

## Goals / Non-Goals

**Goals:**

- Enforce that registered peers can only forward messages they are authorized to speak for.
- Reject registered-peer `join-session` messages before forwarding, including their pairing credentials.
- Reject peer-originated `relay-ready` and keep rejecting peer-originated `peer-disconnected`.
- Use bounded secret-safe relay error/audit reasons.
- Keep checks centralized in relay forwarding code and covered by integration tests.

**Non-Goals:**

- No production identity provider, account system, token lifecycle, or RBAC model.
- No deep authorization state-machine enforcement in the relay; that remains shared protocol/agent logic.
- No new remote action capability, capture, input, file transfer, clipboard sync, installer, service, persistence, or privilege behavior.

## Decisions

- Add a relay-local assertion before forwarding registered-peer messages. It receives the decoded protocol envelope and the registered `RelayPeer`.
- Treat `join-session`, `relay-ready`, and `peer-disconnected` as non-forwardable from registered peers. `join-session` is accepted only as the first unregistered message; `relay-ready` and `peer-disconnected` are relay-originated lifecycle messages.
- Map actor fields by message type: `signal.fromPeerId`, `hello.peerId`, legacy viewer/host consent fields, authorization request/decision fields, `actorPeerId`, and audit-event actor fields must match the registered peer when present.
- Enforce role-bound request/decision semantics for viewer-originated requests and host-originated decisions. The relay does not decide whether a grant is valid, but it prevents a host socket from speaking as a viewer and a viewer socket from speaking as a host.
- Keep rejection reasons fixed strings in the safe relay reason allow-list, so malformed or malicious payloads are not reflected to peers or audit logs.

## Risks / Trade-offs

- Future protocol messages may need explicit actor mapping. Mitigation: keep the assertion exhaustive on known message types and require tests/spec updates when new peer-originated messages are added.
- Role-bound checks could reject experimental flows that misuse host/viewer fields. Mitigation: those flows are unsafe because they blur consent authority; legitimate new flows should add explicit OpenSpec semantics.
- The relay still does not verify fine-grained authorization grants. Mitigation: this change is identity/origin hardening only; fine-grained authorization remains a separate consent state-machine boundary.
