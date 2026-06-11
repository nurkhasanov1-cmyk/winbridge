## Context

CLI parsing already bounds many agent-shell options before `createAgentShellRuntime` is called. The managed runtime is also a public local API used by tests and future embedding code. Some malformed direct options currently fail only after a relay connection opens or after a workflow message is received, because protocol encoding and identity construction validate lazily.

## Goals / Non-Goals

**Goals:**

- Validate direct `AgentShellRuntimeOptions` at the factory boundary.
- Fail before URL mutation, WebSocket creation, join/hello messages, authorization requests, and workflow timers.
- Reuse protocol schemas for role, identifiers, pairing codes, permissions, and device identity fields.
- Keep validation error messages bounded and secret-safe.
- Keep CLI behavior unchanged while sharing runtime validation constants where useful.

**Non-Goals:**

- No changes to relay routing, protocol message schemas, or production authentication.
- No changes to audit event payload semantics.
- No new remote assistance capability such as capture, input, clipboard, file transfer, service installation, persistence, or elevation.

## Decisions

- Add a single runtime validation function invoked at the top of `createAgentShellRuntime`.
  - Rationale: the factory boundary is the earliest point shared by CLI, tests, and embedding code.
  - Alternative rejected: rely on `sendProtocol`/protocol encoding because that still allows relay connection and partial runtime startup first.
- Return a parsed relay URL from validation and reuse it for connection setup.
  - Rationale: avoids validating one URL and connecting with another representation.
- Validate requested and revocation permissions directly with `PermissionSchema`.
  - Rationale: direct callers can bypass CLI `parsePermissions`; duplicates or invalid permissions should not reach authorization request generation.
- Validate timer delays and decision/lifecycle reasons using the same bounds as CLI parsing.
  - Rationale: delayed host workflow simulation is consent-sensitive and should not schedule unsafe timers from direct API calls.
- Validate direct `visibleToHost` as a boolean when provided.
  - Rationale: host visibility is a consent invariant, so truthy non-boolean values must not bypass the visible-session gate.
- Keep errors generic enough to avoid logging raw tokens, pairing codes, display names, or private lifecycle reasons.

## Risks / Trade-offs

- [Risk] Direct tests or embeddings that relied on lazy validation now fail earlier. -> Mitigation: valid values, omissions, and CLI behavior remain unchanged.
- [Risk] Runtime and CLI validation can drift. -> Mitigation: share timer/reason constants from runtime and cover direct runtime validation with regression tests.
- [Risk] Broad validation can over-constrain future options. -> Mitigation: keep scope to existing option fields and protocol schema bounds.
