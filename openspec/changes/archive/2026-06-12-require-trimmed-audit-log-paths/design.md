## Context

WinBridge uses local development JSONL audit files for relay events and host workflow records. Current validation rejects empty and whitespace-only audit paths, but accepts values with leading or trailing whitespace. Those paths are ambiguous in environment variables, CLI commands, logs, and test fixtures, and can cause audit records to be written somewhere other than the operator intended.

## Goals / Non-Goals

**Goals:**

- Reject untrimmed `FileAuditSink` paths before any audit record is written.
- Reject untrimmed relay and agent audit path configuration before relay peer acceptance or agent runtime start.
- Preserve omitted-path fallback behavior: relay console audit output and agent no-file audit persistence.
- Keep diagnostics generic and avoid echoing user-provided path values.

**Non-Goals:**

- No path canonicalization, normalization, expansion, allow-listing, or directory policy.
- No changes to audit record schema, audit redaction, file format, rotation, retention, or permissions.
- No changes to consent, authorization, screen capture, input, clipboard, file transfer, installer behavior, startup persistence, services, privilege elevation, Windows native APIs, tokens, or production authentication.

## Decisions

1. Reject untrimmed audit paths instead of trimming them.
   - Rationale: audit path configuration controls security-relevant output location. Silent trimming could hide a bad environment or CLI producer and make troubleshooting less explicit.
   - Alternative considered: trim paths at each boundary. Rejected because it changes the configured value without making the operator fix the ambiguity.

2. Enforce the rule at shared sink and component boundaries.
   - Rationale: `FileAuditSink` protects direct callers, while relay env parsing and agent CLI/env parsing fail earlier with component-specific bounded diagnostics.
   - Alternative considered: enforce only in `FileAuditSink`. Rejected because component-specific validation should fail before selecting fallback behavior, runtime setup, or relay startup.

3. Keep path diagnostics generic.
   - Rationale: local paths may contain usernames, customer names, support case identifiers, or other private filesystem metadata. Usage errors should identify the invalid option, not echo the raw path.
   - Alternative considered: report which side contains whitespace. Rejected because it reveals unnecessary shape metadata and existing usage handling is intentionally bounded.

## Risks / Trade-offs

- [Risk] A local development setup that intentionally uses leading or trailing spaces in audit file names will fail. -> Mitigation: rename or target a path without surrounding whitespace.
- [Risk] This does not prevent unsafe directories, symlinks, or permission issues. -> Mitigation: keep scope to ambiguity rejection; write failures still surface through the existing file sink behavior.
