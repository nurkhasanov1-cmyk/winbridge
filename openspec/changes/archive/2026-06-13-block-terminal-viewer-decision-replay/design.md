## Context

The viewer runtime stores one current authorization snapshot and uses host-bound lifecycle messages to update it. `session-authorization-state`, `permission-revoked`, and `session-control` already have same-authorization terminal guards, but `session-authorization-decision` currently only checks the local viewer id and observed host authority. That means a same-id decision replay can replace a terminal snapshot before the later active state guard sees the terminal status.

## Goals / Non-Goals

**Goals:**

- Ignore same-authorization `session-authorization-decision` replay after the viewer has a terminal snapshot for that authorization id and host authority.
- Keep ignored replay diagnostics redacted before local trusted `received` event emission.
- Preserve new authorization ids from the observed host as legitimate new consent scopes.
- Cover denied, revoked, terminated, and expired terminal snapshots through focused integration tests.

**Non-Goals:**

- No new protocol fields, message types, relay behavior, persistence, or global ordering model.
- No screen capture, input execution, clipboard access, file transfer, diagnostics collection, reconnect behavior, installer/startup/service changes, token handling changes, privilege elevation, hidden sessions, or consent bypass.

## Decisions

1. Add a viewer decision authority check for terminal same-id snapshots.

   Rationale: the existing inbound untrusted lifecycle gate runs before trusted local `received` event emission, which is the right place to fail closed without exposing private reasons or mutating local authorization.

   Alternative considered: accept the decision event but ignore it in `updateViewerAuthorizationState`. That would still expose the replay as trusted local workflow metadata and is weaker than existing lifecycle rejection behavior.

2. Scope the replay block to matching authorization id and observed host authority.

   Rationale: terminal snapshots should be immutable for the same authorization id, while a new authorization id represents a new explicit consent scope from the observed host.

   Alternative considered: reject every later decision after any terminal snapshot from the same host. That would prevent legitimate new grants in long-lived paired sessions.

3. Keep same-id non-terminal repeated decisions allowed.

   Rationale: existing behavior already supports repeated decision/state flow for non-terminal authorizations, and the separate revocation floor prevents revoked permissions from being restored.

## Risks / Trade-offs

- Risk: a host implementation that reuses authorization ids for fresh consent attempts will fail closed.
  Mitigation: authorization ids are the lifecycle binding key; a new consent scope must use a new id.
- Risk: ignored replay messages may make debugging host bugs harder.
  Mitigation: raw diagnostics still include safe byte-length metadata while withholding protocol payloads and private reasons.
- Risk: this only protects the non-native agent shell runtime.
  Mitigation: future native adapters must follow the same OpenSpec requirement before capture/input work is introduced.
