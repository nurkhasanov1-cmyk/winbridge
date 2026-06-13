## Context

The agent shell role split is part of the consent boundary: viewers request permissions, hosts decide whether to approve and activate visible state. The runtime already sends authorization requests only from viewer mode, but host configuration can still accept requested permissions as a no-op through CLI parsing or direct runtime construction.

## Goals / Non-Goals

**Goals:**

- Make requested permission configuration viewer-only at the CLI boundary.
- Make non-empty direct host runtime requested permissions fail before relay startup.
- Preserve default host startup and existing viewer authorization request behavior.

**Non-Goals:**

- No change to permission vocabulary, authorization-state semantics, host grant narrowing, signal gates, audit persistence, relay forwarding, native capture, input, installer, startup, services, tokens, logs, or privilege behavior.
- No production account/authentication model changes.

## Decisions

- Reject explicit host CLI `--request` immediately after option parsing. CLI has raw option presence, so even a syntactically valid request is rejected before runtime creation.
- Keep direct host runtime `requestedPermissions: []` valid. The CLI defaults to an empty array for both roles, so rejecting empty arrays would break ordinary host startup without adding safety. Non-empty host requested permissions are rejected after permission schema validation so malformed permission diagnostics keep the existing generic runtime permission error path.
- Use a new runtime error family for valid-but-wrong-role requested permissions to distinguish role-boundary failures from malformed permission data.

Alternatives considered:

- Allow host-side requested permissions as a no-op. Rejected because no-op role configuration weakens the clarity of consent automation and can mask test or script mistakes.
- Reject any direct host `requestedPermissions` array, including empty arrays. Rejected because the current CLI-to-runtime shape always supplies an empty array by default.

## Risks / Trade-offs

- Existing development scripts that pass `--request` to host terminals will fail usage validation -> mitigated by documenting that `--request` belongs on the viewer command and host grant narrowing remains configured with `--grant`.
- Direct runtime callers can still pass an empty host `requestedPermissions` array -> accepted intentionally as a compatibility default, with no request sent and no permission grant created.
