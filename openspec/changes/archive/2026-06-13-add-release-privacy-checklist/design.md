## Context

The repository has CI, GitHub templates, SECURITY.md, roadmap, and architecture/security model documentation. It does not yet have a single release readiness checklist or a bootstrap privacy notice that maintainers can use before publishing artifacts or promoting a release.

This change strengthens the repository workflow and release gate only. It does not change runtime behavior or claim that native remote assistance features exist.

## Goals / Non-Goals

**Goals:**

- Add a maintainer-focused release checklist covering consent, visibility, revoke/disconnect, auth/audit gates, data handling, installer/startup/service boundaries, and verification.
- Add a user-facing bootstrap privacy notice documenting current development data handling and explicit non-collection/non-capability claims.
- Link these documents from README, GitHub setup, and the PR template so release/privacy review is easy to find.
- Add an OpenSpec requirement that release candidates keep release and privacy docs current.
- Stabilize the local `npm test` runner so the release gate can run deterministically on Windows-compatible Node runtimes.

**Non-Goals:**

- No runtime, relay, protocol, authentication, audit sink, installer, startup, service, native Windows, capture, input, clipboard, file-transfer, diagnostics, or privilege changes.
- No production legal terms, commercial privacy policy, telemetry system, account system, or signed release automation.
- No claims that screen capture, input injection, unattended access, production deployment, or native Windows clients are implemented.

## Decisions

- Create separate `docs/release-checklist.md` and `docs/privacy-notice.md` files.
  - Rationale: release readiness and data-handling disclosure have different audiences and update cadence.
  - Alternative considered: append both to README. Rejected because README is already operational and would hide release gates in a long quickstart.

- Keep the privacy notice explicit about current bootstrap limitations.
  - Rationale: over-claiming production privacy behavior before native clients exist would mislead users and reviewers.
  - Alternative considered: write a generic product privacy policy. Rejected because the current implementation is not a production remote assistance service.

- Link the documents from existing workflow surfaces instead of adding new automation.
  - Rationale: this is a documentation gate; automated release tooling can come later after actual release packaging exists.
  - Alternative considered: add a CI job that parses checklist text. Rejected because it would provide weak assurance and create maintenance noise.

- Use the Vitest `forks` pool for all serial per-file test invocations in `scripts/run-tests.mjs`.
  - Rationale: local verification reproduced Tinypool worker-thread IPC failures on Windows for runtime integration tests, while the same tests passed under process-based workers.
  - Alternative considered: keep `threads` for selected runtime integration tests. Rejected because it makes the required `npm test` gate non-deterministic in the target development environment.

## Risks / Trade-offs

- [Risk] Documentation can drift as native features are added. -> Mitigation: OpenSpec release gate requires checking release and privacy docs before publication.
- [Risk] A privacy notice may sound like production legal policy. -> Mitigation: title and content explicitly scope it to the current bootstrap.
- [Risk] Checklist-only gates are manual. -> Mitigation: PR template links the checklist and CI still enforces the technical verification gate.
- [Risk] Process-based test workers can be slower than thread workers. -> Mitigation: the runner already executes one file at a time for deterministic output, so reliability is more important than marginal worker startup cost.
