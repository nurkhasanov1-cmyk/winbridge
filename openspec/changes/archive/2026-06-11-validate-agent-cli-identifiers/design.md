## Context

The agent-shell CLI already rejects unknown options, duplicates, malformed pairing codes, malformed permissions, invalid booleans, and invalid numeric delays before creating the runtime options. Session, peer, and device identifiers are currently passed through as raw strings even though protocol schemas now define a shared bounded machine-identifier profile.

## Goals / Non-Goals

**Goals:**
- Parse `--session`, `--peer`, and `--device` through shared protocol identifier schemas.
- Keep current defaults valid.
- Keep error handling consistent by throwing `AgentShellUsageError`.

**Non-Goals:**
- No account identity, MFA, production auth, relay protocol, native Windows UI, capture, input, clipboard, file transfer, service, startup, or installer changes.
- No display-name restrictions beyond existing protocol schema bounds.

## Decisions

1. Reuse protocol schemas in `args.ts`.

   Rationale: agent-shell should validate the same machine-identifier profile used by protocol envelopes and audit metadata. Importing `SessionIdSchema`, `PeerIdSchema`, and `ProtocolIdentifierSchema` avoids drift.

2. Keep usage errors generic.

   Rationale: CLI parsing already reports bounded usage instead of schema internals. This is sufficient for local development and avoids reflecting raw malformed values in a structured error path.

## Risks / Trade-offs

- Local commands using spaces or path separators in `--session`, `--peer`, or `--device` will fail earlier. Mitigation: existing docs use compatible machine IDs, and fail-fast behavior is safer than runtime rejection after connection.
