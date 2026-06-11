## Context

Protocol and authorization schemas require non-blank bounded reason text. The agent-shell CLI already validates many option types before runtime startup, but lifecycle reason options are passed through as raw strings and may be used later by delayed revoke, pause, resume, or terminate simulation.

## Goals / Non-Goals

**Goals:**
- Parse optional lifecycle reason flags with the same non-blank and length constraints as protocol reason fields.
- Keep omitted reasons valid so runtime defaults continue to apply.
- Preserve existing `AgentShellUsageError` behavior for invalid CLI input.

**Non-Goals:**
- No changes to protocol envelopes or authorization state-machine semantics.
- No production policy for reason text, localization, or UI display.
- No remote action implementation.

## Decisions

1. Implement a local CLI reason parser in `args.ts`.

   Rationale: protocol reason schema is not currently exported as a public contract. The CLI can enforce the same visible constraints, non-blank and 240 characters max, without expanding the protocol API surface.

2. Keep reason contents out of audit details.

   Rationale: existing runtime audit metadata records booleans such as `reasonConfigured` and does not persist private reason text. This change only validates input shape and does not make reasons more visible.

## Risks / Trade-offs

- Long local debugging reason strings will be rejected. Mitigation: 240 characters matches protocol-level bounds and is adequate for development workflow simulation.
