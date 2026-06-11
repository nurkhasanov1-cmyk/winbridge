## Context

The development relay CLI and non-native agent-shell CLI are the operator-facing entrypoints for the current TypeScript bootstrap. Both entrypoints currently use `console.error(error)` for unexpected startup or shutdown failures. Node prints `Error` objects with raw messages and stacks, which can expose local paths, env-derived values, tokens, pairing material, protocol fragments, or private workflow text.

The project already uses metadata-only diagnostics for relay rejection reasons and agent-shell runtime/socket errors. CLI entrypoint failures should follow the same pattern.

## Goals / Non-Goals

**Goals:**

- Format unexpected CLI startup/shutdown failures as generic metadata-only diagnostics.
- Preserve the existing agent-shell usage output for expected argument errors.
- Add focused unit coverage that proves raw token/path text and stacks are not printed for unexpected CLI errors.
- Keep relay and agent-shell protocol/runtime behavior unchanged.

**Non-Goals:**

- No changes to relay routing, room lifecycle, shared-token semantics, pairing tickets, or protocol schemas.
- No changes to authorization decisions, host visibility, revocation, pause/resume, termination, or audit event schemas.
- No capture, input, clipboard, file transfer, installer, service, startup persistence, privilege, or Windows prompt work.

## Decisions

1. Use a generic message plus byte-length metadata for unexpected CLI errors.

   Each CLI entrypoint will print a bounded line such as `[winbridge-relay] error messageBytes=<n>` or `[winbridge-agent] error messageBytes=<n>`. The byte length preserves enough diagnostic signal to prove an error was surfaced without exposing raw text.

   Alternative considered: redact known sensitive substrings from raw errors. Rejected because exception strings are unstructured and can contain arbitrary secrets or file paths.

2. Keep expected agent-shell usage errors as usage text.

   `AgentShellUsageError` already emits a static usage string, not user-provided values. Keeping this output avoids reducing CLI usability while still sanitizing unexpected failures.

   Alternative considered: replace all usage errors with metadata-only output. Rejected because it would make local development harder without improving secret safety for the static usage text.

3. Keep formatting local to each app for now.

   Relay and agent-shell prefixes differ, and the logic is small. A new shared package would add workspace overhead without meaningful complexity reduction.

## Risks / Trade-offs

- Less raw debug detail for unexpected startup failures -> intentional; developers can add scoped diagnostics behind future explicit specs if needed.
- Byte length reveals approximate raw message size -> acceptable because it does not reveal tokens, pairing codes, credentials, paths, protocol payloads, screen data, or input data.
- Duplicate formatter logic across two CLI apps -> acceptable for this small boundary; avoid a shared package until more CLI surfaces need it.
