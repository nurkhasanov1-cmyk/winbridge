## Context

The non-native agent shell uses `--request` to simulate viewer permission requests before native Windows capture or input exists. Direct runtime options already receive structured permission arrays and reject malformed values through shared protocol schemas, but CLI parsing currently trims comma-separated request entries before validation.

Because requested permissions become the scope of later authorization decisions, the CLI should not silently normalize whitespace-padded entries. Canonical, exact permission input matches the existing handling for tokens, display names, lifecycle reasons, boolean flags, timer values, and interactive prompt responses.

## Goals / Non-Goals

**Goals:**

- Reject `--request` entries with leading or trailing whitespace before runtime startup.
- Preserve existing behavior for omitted `--request`, valid comma-separated permissions, duplicate detection, and invalid permission rejection.
- Keep diagnostics bounded through existing `AgentShellUsageError` usage text rather than echoing raw requested permission input.

**Non-Goals:**

- No protocol schema change and no relay behavior change.
- No native screen capture, remote input, clipboard, file transfer, diagnostics, installer, startup, service, persistence, privilege, or Windows security prompt work.
- No change to authorization state-machine permissions or direct runtime option validation.

## Decisions

- Make `parsePermissions()` validate exact comma-separated entries by passing raw split entries to `PermissionSchema.parse`.
  - Rationale: this keeps the canonical check at the single CLI permission parsing helper already used by `parseArgs`.
  - Alternative considered: reject whitespace in `args.ts` before calling `parsePermissions`. That would duplicate permission parsing rules and leave the exported helper with surprising normalization behavior.

- Treat whitespace-padded entries as malformed permission values, using the existing usage-error path.
  - Rationale: existing CLI validation already avoids echoing raw invalid values, so this preserves secret-safe diagnostics.
  - Alternative considered: trim and warn. That would keep ambiguous permission input accepted and would require new warning surfaces.

## Risks / Trade-offs

- Existing local scripts that use `--request "screen:view, input:pointer"` will now fail. Mitigation: document canonical comma-separated format without spaces and keep this limited to development CLI parsing.
- This is a small breaking change in the development shell. Mitigation: direct runtime tests and CLI tests will cover both valid exact lists and whitespace-padded rejection.
