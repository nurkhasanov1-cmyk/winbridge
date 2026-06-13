## Context

WinBridge is still a bootstrap foundation. The repository has strong safety and release gates, but the GitHub setup guide's initial issue list names native capture and input adapters as early starter work. That wording is process risk: future autonomous execution could treat those items as ready implementation tasks instead of gated future capabilities.

This change is documentation/process only. It keeps the product in the legitimate remote-assistance category by making backlog sequencing match the consent-first safety model.

## Goals / Non-Goals

**Goals:**

- Make suggested GitHub issues safe for the current bootstrap scope.
- Keep native capture, input, installer, service, startup, and privilege work explicitly behind future OpenSpec design and security review.
- Preserve the roadmap's direction while making prerequisite gates visible.

**Non-Goals:**

- No implementation of capture, input, native Windows APIs, installer, services, startup behavior, or privilege elevation.
- No changes to runtime behavior, protocol schemas, relay behavior, authentication, authorization, token handling, or audit persistence.
- No production deployment, account identity, or hosted service work.

## Decisions

1. Change the GitHub setup guide instead of adding code.

   Rationale: the risk is issue sequencing and contributor guidance, not a runtime defect. A docs-only correction is the narrowest durable fix.

   Alternative considered: leave the issue list as-is and rely on AGENTS.md. Rejected because the issue list is likely to be copied into GitHub and used as the visible work queue.

2. Add an `agent-orchestration` requirement for high-risk backlog sequencing.

   Rationale: this is a workflow contract: backlog items that mention capture, input, native APIs, installer, startup, services, privilege elevation, authentication, authorization, relay routing, tokens, or logging/audit need explicit gates.

   Alternative considered: modifying `safety-boundaries` only. Rejected because the safety boundaries already prohibit covert behavior; the missing piece is orchestration guidance for future work ordering.

## Risks / Trade-offs

- Documentation may become too conservative and slow native progress -> The updated guidance still names native work, but requires OpenSpec design, consent/revocation/audit prerequisites, and security review before implementation.
- A docs-only change could be skipped by future tooling -> Archive the OpenSpec change into `agent-orchestration` so validation keeps the process contract visible.
