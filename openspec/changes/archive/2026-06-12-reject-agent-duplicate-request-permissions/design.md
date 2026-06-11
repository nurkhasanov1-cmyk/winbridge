## Context

Protocol schemas and the shared authorization state machine already reject duplicate permission scopes. The agent shell CLI, however, parses `--request` through a helper that removes duplicates by filtering, so a duplicate CLI request becomes a narrower-looking unique protocol request without surfacing the operator error.

This change keeps the development shell aligned with protocol invariants: malformed permission request scopes fail before the runtime starts or sends session authorization messages.

## Goals / Non-Goals

**Goals:**

- Reject duplicate `--request` permissions during development agent parsing.
- Keep unique comma-separated requested permissions valid.
- Keep omitted `--request` behavior fail-closed with no authorization request.
- Keep error output bounded to existing usage errors.

**Non-Goals:**

- No changes to protocol message schemas or shared authorization state machine behavior.
- No changes to host decision automation, visible activation, revocation, pause/resume, termination, or expiration workflows.
- No capture, input, clipboard, file transfer, installer, startup, service, privilege, relay token, or production account changes.

## Decisions

1. Reject duplicates in the existing `parsePermissions` helper.

   The helper is used by CLI parsing before runtime start. Throwing there lets `parseArgs` convert failures into the existing `AgentShellUsageError` path and keeps peer-facing protocol messages unchanged.

2. Preserve parser order for unique permissions.

   The existing comma-separated order remains stable when permissions are unique, so tests and audit metadata counts do not change for valid requests.

## Risks / Trade-offs

- Local scripts that passed repeated permissions will now fail instead of silently de-duplicating. This is intended because permission scope is consent-sensitive.
